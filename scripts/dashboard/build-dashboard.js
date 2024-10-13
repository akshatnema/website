const { writeFileSync } = require('fs');
const { resolve } = require('path');
const { graphql } = require('@octokit/graphql');
const { Queries } = require('./issue-queries');

let ct = 0;
let temp = 0;

async function pause(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function getHotDiscussions(discussions) {
  // const result = await Promise.all(
  //   discussions.map(async (discussion) => {
  //     try {
  //       const isPR = discussion.__typename === 'PullRequest';
  //       if (discussion.comments.pageInfo.hasNextPage) {
  //         const fetchedDiscussion = await getDiscussionByID(isPR, discussion.id);
  //         discussion = fetchedDiscussion.node;
  //       }

  //       const interactionsCount =
  //         discussion.reactions.totalCount +
  //         discussion.comments.totalCount +
  //         discussion.comments.nodes.reduce((acc, curr) => acc + curr.reactions.totalCount, 0);

  //       const finalInteractionsCount = isPR
  //         ? interactionsCount +
  //           discussion.reviews.totalCount +
  //           discussion.reviews.nodes.reduce((acc, curr) => acc + curr.comments.totalCount, 0)
  //         : interactionsCount;
  //       return {
  //         id: discussion.id,
  //         isPR,
  //         isAssigned: !!discussion.assignees.totalCount,
  //         title: discussion.title,
  //         author: discussion.author ? discussion.author.login : '',
  //         resourcePath: discussion.resourcePath,
  //         repo: `asyncapi/${discussion.repository.name}`,
  //         labels: discussion.labels ? discussion.labels.nodes : [],
  //         score: finalInteractionsCount / (monthsSince(discussion.timelineItems.updatedAt) + 2) ** 1.8
  //       };
  //     } catch (e) {
  //       console.error(`there was some issues while parsing this item: ${JSON.stringify(discussion)}`);
  //       throw e;
  //     }
  //   })
  // );

  const result = [];

  for (let i = 0; i < discussions.length; i += 5) {
    const batch = discussions.slice(i, i + 5);
    const batchResults = await Promise.all(
      batch.map(async (discussion) => {
        try {
          await pause(1000);
          const isPR = discussion.__typename === 'PullRequest';
          if (discussion.comments.pageInfo.hasNextPage) {
            const fetchedDiscussion = await getDiscussionByID(isPR, discussion.id);
            discussion = fetchedDiscussion.node;
          }

          const interactionsCount =
            discussion.reactions.totalCount +
            discussion.comments.totalCount +
            discussion.comments.nodes.reduce((acc, curr) => acc + curr.reactions.totalCount, 0);

          const finalInteractionsCount = isPR
            ? interactionsCount +
              discussion.reviews.totalCount +
              discussion.reviews.nodes.reduce((acc, curr) => acc + curr.comments.totalCount, 0)
            : interactionsCount;
          return {
            id: discussion.id,
            isPR,
            isAssigned: !!discussion.assignees.totalCount,
            title: discussion.title,
            author: discussion.author ? discussion.author.login : '',
            resourcePath: discussion.resourcePath,
            repo: `asyncapi/${discussion.repository.name}`,
            labels: discussion.labels ? discussion.labels.nodes : [],
            score: finalInteractionsCount / (monthsSince(discussion.timelineItems.updatedAt) + 2) ** 1.8
          };
        } catch (e) {
          console.error(`there was some issues while parsing this item: ${JSON.stringify(discussion)}`);
          throw e;
        }
      })
    );
    result.push(...batchResults);
  }
  result.sort((ElemA, ElemB) => ElemB.score - ElemA.score);
  const filteredResult = result.filter((issue) => issue.author !== 'asyncapi-bot');
  return filteredResult.slice(0, 12);
}
async function writeToFile(content) {
  writeFileSync(resolve(__dirname, '..', '..', 'dashboard.json'), JSON.stringify(content, null, '  '));
}
async function mapGoodFirstIssues(issues) {
  return issues.map((issue) => ({
    id: issue.id,
    title: issue.title,
    isAssigned: !!issue.assignees.totalCount,
    resourcePath: issue.resourcePath,
    repo: `asyncapi/${issue.repository.name}`,
    author: issue.author.login,
    area: getLabel(issue, 'area/') || 'Unknown',
    labels: issue.labels.nodes.filter(
      (label) => !label.name.startsWith('area/') && !label.name.startsWith('good first issue')
    )
  }));
}

function getLabel(issue, filter) {
  const result = issue.labels.nodes.find((label) => label.name.startsWith(filter));
  return result && result.name.split('/')[1];
}

function monthsSince(date) {
  const seconds = Math.floor((new Date() - new Date(date)) / 1000);
  // 2592000 = number of seconds in a month = 30 * 24 * 60 * 60
  const months = seconds / 2592000;
  return Math.floor(months);
}

async function getDiscussions(query, pageSize, endCursor = null) {
  try {
    temp += 1;
    ct = Math.max(ct, temp);

    console.log('getDiscussions+ct', ct);
    const result = await graphql(query, {
      first: pageSize,
      after: endCursor,
      headers: {
        authorization: `token ${process.env.GITHUB_TOKEN}`
      }
    });

    temp -= 1;

    if (result.rateLimit.remaining <= 100) {
      console.log(
        `[WARNING] GitHub GraphQL rateLimit`,
        `cost = ${result.rateLimit.cost}`,
        `limit = ${result.rateLimit.limit}`,
        `remaining = ${result.rateLimit.remaining}`,
        `resetAt = ${result.rateLimit.resetAt}`
      );
    }

    const { hasNextPage } = result.search.pageInfo;

    if (!hasNextPage) {
      return result.search.nodes;
    }
    return result.search.nodes.concat(await getDiscussions(query, pageSize, result.search.pageInfo.endCursor));
  } catch (e) {
    console.error(e);
  }
}
async function getDiscussionByID(isPR, id) {
  try {
    temp += 1;
    ct = Math.max(ct, temp);

    console.log('getDiscussionByID+ct', ct);
    const result = await graphql(isPR ? Queries.pullRequestById : Queries.issueById, {
      id,
      headers: {
        authorization: `token ${process.env.GITHUB_TOKEN}`
      }
    });

    temp -= 1;
    return result;
  } catch (e) {
    console.error(e);
  }
}
async function start() {
  try {
    const issues = await getDiscussions(Queries.hotDiscussionsIssues, 20);
    await pause(1000);
    const PRs = await getDiscussions(Queries.hotDiscussionsPullRequests, 20);
    await pause(1000);
    const rawGoodFirstIssues = await getDiscussions(Queries.goodFirstIssues, 20);
    await pause(1000);
    const discussions = issues.concat(PRs);
    const [hotDiscussions, goodFirstIssues] = await Promise.all([
      getHotDiscussions(discussions),
      mapGoodFirstIssues(rawGoodFirstIssues)
    ]);
    writeToFile({ hotDiscussions, goodFirstIssues });
  } catch (e) {
    console.log('There were some issues parsing data from github.');
    console.log(e);
  }
}
start();

module.exports = { getLabel, monthsSince, mapGoodFirstIssues, getHotDiscussions, getDiscussionByID };
