import test from 'node:test';
import assert from 'node:assert/strict';
import {staticConfig} from '../scripts/build-static.mjs';
import {siteBase,siteRoute} from '../site-path.js';
import {publicFiles} from '../scripts/public-files.mjs';
const fixture={PUBLIC_SITE_URL:'https://example.invalid/sahoo-academy',PUBLIC_SUPABASE_URL:'https://fixture.supabase.co',PUBLIC_SUPABASE_PUBLISHABLE_KEY:'sb_publishable_fixture'};
test('static build rejects absent configuration and server credentials without logging values',()=>{
 for(const input of [{},{...fixture,PUBLIC_SUPABASE_PUBLISHABLE_KEY:'sb_secret_fixture'},{...fixture,PUBLIC_SUPABASE_URL:'http://fixture.supabase.co'},{...fixture,PUBLIC_SITE_URL:'https://user:password@example.invalid/'}])assert.throws(()=>staticConfig(input));
 assert.equal(staticConfig(fixture).site.pathname,'/sahoo-academy/');
});
test('base-aware config, auth redirects and routing support root, Pages, custom domains and callbacks',()=>{
 for(const base of ['http://127.0.0.1:4173/','https://example.invalid/sahoo-academy/','https://custom.invalid/']){
  const url=new URL(base);assert.equal(siteBase(base).href,base);
  assert.equal(new URL('public-config.json',siteBase(base)).pathname,url.pathname+'public-config.json');
  assert.equal(siteRoute(new URL(base),base),'home');
  assert.equal(siteRoute(new URL(base+'index.html'),base),'home');
  assert.equal(siteRoute(new URL(base+'#/test/free'),base),'test/free');
  assert.equal(siteRoute(new URL(base+'subject/geography?exam=example'),base),'subject/geography?exam=example');
  assert.equal(siteRoute(new URL(base+'#access_token=synthetic&type=signup'),base),'home');
 }
});
test('public allowlist excludes server/config/question banks and includes all shared browser dependencies',()=>{
 assert.ok(publicFiles.includes('site-path.js'));assert.ok(publicFiles.includes('supabase-vendor.js'));
 assert.ok(publicFiles.every(f=>!f.includes('/')&&!/server|tests|\.env|sql|package|private/i.test(f)));
 assert.equal(new Set(publicFiles).size,publicFiles.length);
});
