import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
const digest=value=>createHash('sha256').update(value).digest('hex');
const raw=await fs.readFile('.github/integration-source-review.json','utf8');
assert.equal(digest(raw),'cf36d3c556fb75c8d39810090dd82825e411179b417253a9b616146b778c8fc1');
const plan=JSON.parse(raw),outputs=[];
assert.equal(plan.length,11);
for(const item of plan){
  assert.ok(/^(?:src\/|core\/|scripts\/|docs\/|README\.md$|CHANGELOG\.md$|package\.json$)/.test(item.path));
  assert.ok(!item.path.split('/').some(part=>part==='..'||part==='.'||!part));
  assert.ok(path.resolve(item.path).startsWith(process.cwd()+path.sep));
  const previous=await fs.readFile(item.path,'utf8');
  assert.equal(digest(previous),item.before,'Input changed: '+item.path);
  const lines=previous.match(/[^\n]*\n|[^\n]+$/g)||[];
  let last=lines.length;
  for(const edit of [...item.edits].reverse()){
    assert.ok(Number.isInteger(edit.start)&&Number.isInteger(edit.end)&&edit.start>=0&&edit.end>=edit.start&&edit.end<=last);
    last=edit.start;
    lines.splice(edit.start,edit.end-edit.start,edit.text);
  }
  const next=lines.join('');
  assert.equal(digest(next),item.after,'Output differs: '+item.path);
  outputs.push([item.path,next]);
}
// Verify every input and output before writing any source file. No project code is executed.
for(const [file,next] of outputs){await fs.writeFile(file,next);console.log('VERIFIED',file,digest(next));}
