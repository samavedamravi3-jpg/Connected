import {spawnSync} from 'node:child_process';
import {existsSync,readFileSync} from 'node:fs';
const config='dist/server/wrangler.json';
if(!existsSync(config))throw new Error('Run npm run build before applying local migrations.');
// Wrangler tracks applied migrations; this command is safe to repeat.
const conf=JSON.parse(readFileSync(config,'utf8'));conf.d1_databases=conf.d1_databases.map(d=>({...d,migrations_dir:'../../drizzle'}));
// The generated config lives in dist/server; configure Drizzle's migration directory there.
import {writeFileSync} from 'node:fs';
writeFileSync(config,JSON.stringify(conf,null,2));
const result=spawnSync(process.execPath,['--import','./scripts/sites-env.mjs','./node_modules/wrangler/bin/wrangler.js','d1','migrations','apply','DB','--local','--config',config,'--persist-to','.wrangler/state'],{stdio:'inherit'});
process.exit(result.status??1);
