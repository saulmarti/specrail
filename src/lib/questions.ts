import { findTask, loadTask, saveTask, setSection, appendLog } from './task.js';
import type { TaskQuestion } from './types.js';
import { recordTrace } from './trace.js';
import { assertConcurrencyMutationAuthority, releaseConcurrencyTaskReservation } from './concurrency.js';

const START='<!-- AI-FLOW:QUESTIONS-DATA';
const END='AI-FLOW:QUESTIONS-DATA -->';
function readData(body:string): TaskQuestion[] {
  const start=body.indexOf(START), end=body.indexOf(END,start+START.length);
  if(start<0||end<0)return[];
  const raw=body.slice(start+START.length,end).trim();
  try{return JSON.parse(raw) as TaskQuestion[];}catch{throw new Error('Questions data is invalid JSON');}
}
function render(questions:TaskQuestion[]): string {
  const data=`${START}\n${JSON.stringify(questions,null,2)}\n${END}`;
  const visible=questions.length?questions.map(q=>`### ${q.id} — ${q.status}\n\n- **Question:** ${q.text}\n- **Choices:** ${(q.options||[]).join(' | ')}\n- **Recommendation:** ${q.recommendation||'None'}\n- **Answer:** ${q.answer||''}`).join('\n\n'):'_No open questions._';
  return `${data}\n\n${visible}`;
}
function validateChoices(input:AddQuestionInput):string[]{
  const values=(input.options??[]).map(value=>String(value).trim()).filter(Boolean);
  if(values.length<2||values.length>4)throw new Error('Clarification questions require between 2 and 4 choices; free text is provided separately by the host');
  if(new Set(values).size!==values.length)throw new Error('Clarification question choices must be unique');
  const recommendation=input.recommendation?String(input.recommendation).trim():null;
  if(recommendation&&!values.includes(recommendation))throw new Error('Question recommendation must match one of the provided choices');
  return values;
}
export function listQuestions(root:string,id:string): TaskQuestion[] {return readData(loadTask(findTask(root,id)).body);}
export interface AddQuestionInput {text:string;category?:string;impact?:string;options?:string[];recommendation?:string|null}
export function addQuestion(root:string,id:string,input:AddQuestionInput,options:{sessionId?:string|null}={}): TaskQuestion {
  assertConcurrencyMutationAuthority(root,id,options.sessionId);
  const choices=validateChoices(input);
  const task=loadTask(findTask(root,id)),questions=readData(task.body),number=questions.reduce((max,q)=>Math.max(max,Number(q.id?.split('-')[1]||0)),0)+1;
  const question:TaskQuestion={id:`Q-${String(number).padStart(3,'0')}`,status:'open',category:input.category||'general',impact:input.impact||'medium',text:String(input.text||'').trim(),options:choices,recommendation:input.recommendation?String(input.recommendation).trim():null,answer:null,created_at:new Date().toISOString(),answered_at:null};
  if(!question.text)throw new Error('Question text must not be empty');
  questions.push(question);task.body=setSection(task.body,'Questions',render(questions));task.meta.open_questions=questions.filter(q=>q.status==='open').length;task.meta.waiting_for='user';
  if(!['draft','refining','awaiting_spec_approval'].includes(task.meta.status)){task.meta.resume_status=task.meta.status;task.meta.resume_phase=task.meta.phase;task.meta.status='blocked';}
  appendLog(task,`Question ${question.id} added; workflow waits for user.`);const saved=saveTask(task);recordTrace(root,saved,'question-added',{questionId:question.id,category:question.category,impact:question.impact});releaseConcurrencyTaskReservation(root,id,options.sessionId===undefined?{}:{sessionId:options.sessionId});return question;
}
export function answerQuestion(root:string,id:string,questionId:string,answer:string): ReturnType<typeof saveTask> {
  const task=loadTask(findTask(root,id)),questions=readData(task.body),question=questions.find(q=>q.id===questionId);if(!question)throw new Error(`Question not found: ${questionId}`);if(question.status!=='open')throw new Error(`Question already answered: ${questionId}`);
  const value=String(answer).trim();if(!value)throw new Error('Question answer must not be empty');
  question.status='answered';question.answer=value;question.answered_at=new Date().toISOString();task.body=setSection(task.body,'Questions',render(questions));task.meta.open_questions=questions.filter(q=>q.status==='open').length;
  if(task.meta.open_questions===0){task.meta.waiting_for='none';if(task.meta.status==='blocked'&&task.meta.resume_status){task.meta.status=task.meta.resume_status;task.meta.phase=task.meta.resume_phase??'product-specifier';task.meta.resume_status=null;task.meta.resume_phase=null;}releaseConcurrencyTaskReservation(root,id,{force:true});}
  appendLog(task,`Question ${questionId} answered by user.`);const saved=saveTask(task);recordTrace(root,saved,'question-answered',{questionId});return saved;
}
