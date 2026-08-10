import path from 'node:path';
export function codexFreshChatUrl(root:string,taskId:string):string{
  const url=new URL('codex://threads/new');
  url.searchParams.set('prompt',`Continue ${String(taskId).trim()}`);
  url.searchParams.set('path',path.resolve(root));
  return url.toString();
}
