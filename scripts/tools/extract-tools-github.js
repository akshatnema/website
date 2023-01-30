const axios = require('axios');
const {request} = require('@octokit/request')
const {Octokit} = require('@octokit/rest')

const getData = async () => {
  try {
    // const result = await axios.get(
    //   'https://api.github.com/search/code?q=filename:.asyncapi-tool',
    //   {
    //     headers: {
    //       accept: 'application/vnd.github.text-match+json',
    //       authorization: `token `,
    //     },
    //   }
    // );

    // const result = await request("GET /search/code?q=filename:{query}", {
    //   headers: {
    //     authorization: `token ${process.env.GITHUB_TOKEN}`,
    //   },
    //   query: ".asyncapi-tool"
    // });
    
    const octokit = new Octokit({
      auth: `token ${process.env.GITHUB_TOKEN}`
    })
    const { data } = await octokit.rest.search.code({
      q: `filename:.asyncapi-tool`
    });

    console.log(JSON.stringify(data, null, 2))
    return data;
  } catch (err) {
    console.log(err);
    throw err;
  }
};

module.exports = { getData };