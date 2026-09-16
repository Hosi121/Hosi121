// Usage: METRICS_DIR=/path/to/lowlighter-metrics node refresh-metrics.mjs
// Requires Metrics v3.34 dependencies, gh authentication and Chromium.
import {execFileSync} from 'node:child_process';
import {writeFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import path from 'node:path';
const root = process.env.METRICS_DIR;
if (!root) throw new Error('Set METRICS_DIR to a Metrics v3.34 checkout');
process.env.PUPPETEER_BROWSER_PATH ||= execFileSync('which', ['chromium'], {encoding:'utf8'}).trim();
const load = p => import(pathToFileURL(path.join(root,p)));
const {default:setup} = await load('source/app/metrics/setup.mjs');
const {default:metrics} = await load('source/app/metrics/index.mjs');
const {graphql:gql} = await load('node_modules/@octokit/graphql/dist-node/index.js');
const {Octokit} = await load('node_modules/@octokit/rest/dist-node/index.js');
const token = execFileSync('gh',['config','get','-h','github.com','oauth_token'],{encoding:'utf8'}).trim();
const api = new Octokit({auth:token});
const graphqlRaw = gql.defaults({headers:{authorization:`token ${token}`}});
const cache = new Map();
const graphql = async (query, ...args) => {
  if (cache.has(query)) return structuredClone(cache.get(query));
  // Classic Projects is retired. Hide its achievement instead of inventing a new rank.
  const classicProjects = /projects\(first: 1, orderBy: \{field: CREATED_AT, direction: ASC\}\) \{[\s\S]*?\n    \}/;
  const hadProjects = classicProjects.test(query);
  let result;
  if (query.includes('query BaseRepositories')) {
    // v3.34 stops early when its batch size is below the repository limit.
    // Fetch every page here, with smaller requests to avoid API timeouts.
    const type = query.includes('repositoriesContributedTo(') ? 'repositoriesContributedTo' : 'repositories';
    let cursor;
    const nodes = [];
    do {
      const pageQuery = query.replace(/first: \d+/, `first: 10${cursor ? ` after: "${cursor}"` : ''}`);
      const page = await graphqlRaw(pageQuery,...args);
      const connection = page.user[type];
      nodes.push(...connection.nodes);
      cursor = connection.edges.at(-1)?.cursor;
      if (connection.nodes.length < 10) break;
    } while (cursor && nodes.length < 100);
    result = {user:{[type]:{nodes,edges:[]}}};
  } else {
    result = await graphqlRaw(query.replace(classicProjects,''),...args);
  }
  if (hadProjects && result.user) result.user.projects = {totalCount:0,nodes:[]};
  if (result.user?.login === 'Hosi121') result.user.name = 'Hosi121';
  cache.set(query,structuredClone(result));
  return result;
};
const {conf,Plugins,Templates} = await setup({log:false,extras:true});
conf.settings.token = token;
conf.settings.extras = {default:true};
conf.settings.optimize = true;
const jobs = [
  ['iso_calender.svg',{isocalendar:true,'isocalendar.duration':'half-year'}],
  ['issue_pr_lang.svg',{followup:true,languages:true,'languages.limit':8}],
  ['achievements.svg',{achievements:true,'achievements.threshold':'B','achievements.display':'detailed','achievements.limit':7,'achievements.ignored':'manager'}],
];
const outputs = [];
for (const [file,options] of jobs) {
  const q = {base:false,'config.timezone':'Asia/Tokyo',...options};
  const plugins = Object.fromEntries(Object.keys(Plugins).map(k=>[k,{enabled:options[k]===true}]));
  const result = await metrics({login:'Hosi121',q},{graphql,rest:Object.assign(api.rest,{request:api.request}),plugins,conf,die:true},{Plugins,Templates});
  if (!result.rendered || result.errors?.length || /NaN/.test(result.rendered)) throw new Error(`Generation failed: ${file}: invalid data or ${JSON.stringify(result.errors)}`);
  // Metrics labels the authenticated repository total as public even when it
  // includes private repositories. Keep the count, correct the label.
  const rendered = result.rendered
    .replace(/Published (\d+) public repositories/g,'Created $1 repositories')
    .replace(/<svg\b[^>]*>/, tag => {
      // Keep foreignObject layout at its generated width when GitHub scales
      // the image. Reserve room for font fallback and wrapped legends.
      const width = Number(tag.match(/\bwidth="(\d+)"/)[1]);
      const height = Number(tag.match(/\bheight="(\d+)"/)[1]) + 48;
      return tag.replace(/\sviewBox="[^"]*"/,'')
        .replace(/\bheight="\d+"/,`height="${height}"`)
        .replace(/>$/,` viewBox="0 0 ${width} ${height}">`);
    });
  outputs.push([file,rendered]);
}
for (const [file,rendered] of outputs) {
  await writeFile(new URL(file,import.meta.url),rendered);
  console.log(`Updated ${file}`);
}
