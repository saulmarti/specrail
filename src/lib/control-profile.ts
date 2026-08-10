import type { TaskDocument, TaskRoute } from './types.js';
import { defaultRoute } from './types.js';

export type ControlProfile = 'micro' | 'light' | 'standard' | 'rigorous';
const RANK:Record<ControlProfile,number>={micro:0,light:1,standard:2,rigorous:3};
function norm(value:unknown):string{return String(value??'').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9#._/-]+/g,' ').replace(/\s+/g,' ').trim();}
function section(body:string,name:string):string{const marker=`## ${name}`;const start=body.indexOf(marker);if(start<0)return'';const from=start+marker.length;const next=body.indexOf('\n## ',from);return body.slice(from,next<0?body.length:next).trim();}
function governedText(task:TaskDocument):string{return norm([task.meta.title,section(task.body,'Need'),section(task.body,'Scope'),section(task.body,'Acceptance Criteria'),section(task.body,'UI Target')].filter(Boolean).join(' '));}
function any(text:string,patterns:RegExp[]):boolean{return patterns.some(pattern=>pattern.test(text));}
const SENSITIVE=[/\bauth(?:entication|orization)?\b/,/\bautenticacion\b/,/\blogin\b/,/\bsession\b/,/\bsesion\b/,/\b(?:access|refresh|auth|api|bearer) token(?:s)?\b/,/\bjwts?\b/,/\bpassword\b/,/\bcontrasena\b/,/\bsecurity\b/,/\bseguridad\b/,/\bpermission(?:s)?\b/,/\bpermisos?\b/,/\bdatabase\b/,/\bbase de datos\b/,/\bschema\b/,/\besquema\b/,/\bmigrat(?:e|ion|ing)\b/,/\bmigracion\b/,/\bapi\b/,/\bbackend\b/,/\bpayment\b/,/\bpago(?:s)?\b/,/\bbilling\b/,/\bprivacy\b/,/\bprivacidad\b/,/\bencrypt(?:ion|ed)?\b/,/\bcifrad[oa]\b/,/\bperformance\b/,/\brendimiento\b/,/\blatency\b/,/\blatencia\b/,/\bconcurrenc(?:y|e)\b/,/\bconcurrencia\b/];
const BEHAVIOR=[/\bclick\b/,/\btap\b/,/\bsubmit\b/,/\bvalidat(?:e|ion)\b/,/\bflow\b/,/\bnavigat(?:e|ion)\b/,/\bredirect\b/,/\binteraction\b/,/\bbehavior\b/,/\bbehaviour\b/,/\blogic\b/,/\bfilter\b/,/\bsort\b/,/\bsearch\b/,/\bfetch\b/,/\b(?:create|update|delete|save) (?:data|record|item|profile|account|setting|state|value|entry|resource)\b/,/\b(?:crear|actualizar|eliminar|guardar) (?:datos?|registro|perfil|cuenta|estado|valor|recurso)\b/,/\bal pulsar\b/,/\bal hacer click\b/,/\bcuando (?:se )?(?:pulsa|hace click|envia|guarda)\b/];
const RESPONSIVE_OR_LAYOUT=[/\bresponsive\b/,/\bmobile\b/,/\bmovil\b/,/\btablet\b/,/\bdesktop\b/,/\bescritorio\b/,/\bbreakpoint\b/,/\blayout\b/,/\bgrid\b/,/\bflex\b/,/\bposition(?:ing)?\b/,/\bwidth\b/,/\bancho\b/,/\bheight\b/,/\balto\b/,/\b(?:fix|resolve|remove|avoid|prevent|corrige|arregla|elimina|evita) (?:the )?(?:horizontal )?overflow\b/,/\bhierarchy\b/,/\bjerarquia\b/,/\bdominant\b/,/\bdominante\b/];
const SHARED_DESIGN_SURFACE=[/\bdesign token(?:s)?\b/,/\btoken (?:de )?(?:diseno|tema|theme)\b/,/\btheme (?:token|variable|color|colour)\b/,/\bcss (?:variable|custom property)\b/,/\bcustom propert(?:y|ies)\b/,/\bvariable(?:s)? (?:global(?:es)?|de tema|de theme|de diseno)\b/,/\b(?:global|shared) (?:color|colour|spacing|typography) (?:token|variable)\b/];
const MATERIAL_DESIGN=[/\bredesign\b/,/\bredisen(?:a|ar|o)\b/,/\brework\b/,/\bnew design\b/,/\bnuevo diseno\b/,/\bvisual direction\b/,/\bdireccion visual\b/,/\bdesign system\b/,/\bsistema de diseno\b/,/\bwhole page\b/,/\bentire page\b/,/\bglobal\b/,/\bacross (?:the )?(?:app|site|application)\b/,/\btoda (?:la )?(?:app|web|pagina)\b/];
const MICRO=[/\bcolor\b/,/\bcolour\b/,/\bbackground(?: color)?\b/,/\bfondo\b/,/\bfont size\b/,/\bfont weight\b/,/\btypography size\b/,/\btamano (?:de )?(?:fuente|texto|icono)\b/,/\bpadding\b/,/\bmargin\b/,/\bmargen\b/,/\bgap\b/,/\bborder radius\b/,/\bradius\b/,/\bradio (?:del )?borde\b/,/\bicon\b/,/\bicono\b/,/\blabel\b/,/\betiqueta\b/,/\bcopy\b/,/\bwording\b/,/\btext\b/,/\btexto\b/,/\bsize\b/];
function frontend(task:TaskDocument):boolean{return task.meta.surfaces.some(surface=>['frontend','ui','ux'].includes(String(surface).toLowerCase()));}
function explicitHighRisk(task:TaskDocument,text:string):boolean{return ['high','critical'].includes(norm(task.meta.risk))||any(text,SENSITIVE)||task.meta.type==='architecture'||task.meta.type==='database';}
export function classifyControlProfile(task:TaskDocument):{profile:ControlProfile;reasons:string[]}{
  const text=governedText(task),reasons:string[]=[];
  if(explicitHighRisk(task,text)){reasons.push('sensitive/high-risk behavior requires full independent controls');return{profile:'rigorous',reasons};}
  if(task.meta.size==='large'||task.meta.type==='design'||task.meta.surfaces.length>1){reasons.push('large/design/multi-surface scope is not a local patch');return{profile:'standard',reasons};}
  if(frontend(task)){
    if(any(text,MATERIAL_DESIGN)){reasons.push('material redesign or broad visual scope');return{profile:'standard',reasons};}
    if(any(text,BEHAVIOR)){reasons.push('observable behavior/interaction changes');return{profile:'standard',reasons};}
    if(any(text,SHARED_DESIGN_SURFACE)){reasons.push('shared design token/theme variable may propagate beyond one element');return{profile:'light',reasons};}
    if(any(text,RESPONSIVE_OR_LAYOUT)){reasons.push('responsive/layout/judgment work needs design and browser verification');return{profile:'light',reasons};}
    if(any(text,MICRO)&&task.meta.size==='small'&&norm(task.meta.risk)==='low'){reasons.push('localized low-risk cosmetic/copy-only frontend change');return{profile:'micro',reasons};}
    reasons.push(task.meta.type==='feature'?'frontend feature scope is not proven to be a local cosmetic patch':'frontend change is not proven to be purely cosmetic');return{profile:'standard',reasons};
  }
  if(task.meta.type==='feature'){reasons.push('non-visual feature behavior keeps normal independent controls');return{profile:'standard',reasons};}
  if(task.meta.size==='small'&&norm(task.meta.risk)==='low'&&!any(text,BEHAVIOR)){reasons.push('small low-risk non-visual change');return{profile:'light',reasons};}
  reasons.push('normal implementation controls');return{profile:'standard',reasons};
}
function profileOf(route:TaskRoute):ControlProfile|null{const value=String(route.control_profile??'');return value in RANK?value as ControlProfile:null;}
function applyMinimumRoute(task:TaskDocument,profile:ControlProfile,reasons:string[],provisional:boolean,restoreSafeguards:boolean):void{
  const defaults=defaultRoute(task.meta.surfaces,task.meta.type),route=task.meta.route,hasFrontend=frontend(task);
  if(profile==='micro'){
    route.design=false;route.architecture=false;route.database=false;route.implementation=defaults.implementation;route.technical_review='none';route.qa='none';route.final_customer=false;route.mutation_testing=false;route.property_testing='none';route.observability='none';route.target_audience=false;
  } else if(profile==='light'){
    route.design=false;route.architecture=defaults.architecture;route.database=defaults.database;route.implementation=defaults.implementation;route.technical_review='none';route.qa=hasFrontend?'focused':defaults.qa;route.final_customer=false;route.mutation_testing=false;route.property_testing='none';route.observability='none';route.target_audience=false;
  } else {
    // Preserve explicit 0.10.x/project routing when a task is already standard. Only an
    // actual escalation from a cheaper profile may restore safeguards that proportional
    // routing previously disabled. Rigorous risk always enforces its additional controls.
    if(restoreSafeguards){
      route.design=route.design||defaults.design;route.architecture=route.architecture||defaults.architecture;route.database=route.database||defaults.database;route.implementation=defaults.implementation;
      if(defaults.technical_review!=='none'&&route.technical_review==='none')route.technical_review=profile==='rigorous'?'full':defaults.technical_review;
      if(defaults.qa!=='none'&&route.qa==='none')route.qa=defaults.qa;
      if(defaults.final_customer)route.final_customer=true;
    }
    if(profile==='rigorous'){route.implementation=defaults.implementation;route.technical_review=route.implementation?'full':route.technical_review;if(['high','critical'].includes(norm(task.meta.risk)))route.property_testing='required';if(norm(task.meta.risk)==='critical')route.mutation_testing=true;route.observability=norm(task.meta.risk)==='critical'?'full':'focused';}
  }
  route.control_profile=profile;route.control_reasons=reasons;route.control_profile_version=1;route.control_profile_provisional=provisional;
}
export function applyControlProfile(task:TaskDocument,options:{lock?:boolean}={}):{task:TaskDocument;profile:ControlProfile;changed:boolean;escalated:boolean;downgraded:boolean;reasons:string[]}{
  const recommended=classifyControlProfile(task),current=profileOf(task.meta.route);
  const planningOpen=task.meta.phase==='product-specifier'&&task.meta.spec_approval!=='approved';
  const provisional=options.lock===true?false:planningOpen;
  // Planning classifications are provisional: as the specification becomes concrete they may
  // legitimately become cheaper. Once planning is sealed, automatic routing can only escalate.
  const profile=!current?recommended.profile:planningOpen?recommended.profile:(RANK[recommended.profile]>RANK[current]?recommended.profile:current);
  const changed=current!==profile,escalated=Boolean(current&&RANK[profile]>RANK[current]),downgraded=Boolean(current&&RANK[profile]<RANK[current]);
  const reasons=profile===recommended.profile?recommended.reasons:[`retained sealed ${profile} controls; current signals would recommend ${recommended.profile}`];
  applyMinimumRoute(task,profile,reasons,provisional,Boolean(current&&RANK[profile]>RANK[current]));
  return{task,profile,changed,escalated,downgraded,reasons};
}
export function controlProfile(task:TaskDocument):ControlProfile{return profileOf(task.meta.route)??classifyControlProfile(task).profile;}
export function isMicroControl(task:TaskDocument):boolean{return controlProfile(task)==='micro';}
export function isLowControl(task:TaskDocument):boolean{return ['micro','light'].includes(controlProfile(task));}
export function requiresProductIntelligenceControls(task:TaskDocument):boolean{return !isLowControl(task);}

export function requiresPhaseBoundary(task:TaskDocument,phase:unknown=task.meta.phase):boolean{const profile=controlProfile(task);if(String(phase)==='builder'&&(profile==='micro'||profile==='light'))return false;return String(phase)==='builder'||String(phase)==='technical-reviewer';}

export function requiredVisualRoles(task:TaskDocument,stage:'specification'|'final'):Array<'before'|'proposal'|'after'>{const profile=controlProfile(task);if(stage==='specification'){if(profile==='micro')return[];if(profile==='light')return['before'];return['before','proposal'];}if(profile==='micro')return['after'];if(profile==='light')return['before','after'];return['before','proposal','after'];}

export function fastModeRequested(task:TaskDocument):boolean{return task.meta.workflow_mode==='fast';}
export function fastModeActive(task:TaskDocument):boolean{return fastModeRequested(task)&&['micro','light'].includes(controlProfile(task));}
export function applyFastModeRoute(task:TaskDocument):boolean{
  if(!fastModeActive(task)){task.meta.route.fast_mode=false;return false;}
  task.meta.route.design=false;
  task.meta.route.technical_review='none';
  task.meta.route.qa='none';
  task.meta.route.final_customer=false;
  task.meta.route.mutation_testing=false;
  task.meta.route.property_testing='none';
  task.meta.route.observability='none';
  task.meta.route.fast_mode=true;
  return true;
}
