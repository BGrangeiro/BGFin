export function createNavigationOrder({api,toast}) {
  const groups=[{name:'navigation',root:document.querySelector('.sidebar nav'),attribute:'data-page'},
    {name:'workspaces',root:document.querySelector('.workspace-tabs'),attribute:'data-workspace'}];
  let drag=null,suppressClick=false;
  const pending=new Set();
  const items=group=>[...group.root.querySelectorAll(`a[${group.attribute}]`)];
  const order=group=>items(group).map(item=>item.getAttribute(group.attribute));
  function apply(group,keys){
    const links=items(group);
    for(const key of keys||[]){const link=links.find(item=>item.getAttribute(group.attribute)===key);if(link)group.root.append(link);}
  }
  async function save(group,before){
    const keys=order(group);if(keys.every((key,index)=>key===before[index]))return;
    pending.add(group.name);group.root.setAttribute('aria-busy','true');
    try{await api('/preferences',{method:'PUT',body:JSON.stringify({[group.name]:keys})});toast('Ordem das abas salva.');}
    catch(error){apply(group,before);toast(error.message,true);}
    finally{pending.delete(group.name);group.root.removeAttribute('aria-busy');}
  }
  function clearTarget(){for(const group of groups)for(const item of items(group))item.classList.remove('nav-drop-before','nav-drop-after');}
  function finish(cancel=false){
    if(!drag)return;const current=drag;drag=null;
    if(current.link.hasPointerCapture(current.pointerId))current.link.releasePointerCapture(current.pointerId);
    current.ghost?.remove();current.link.classList.remove('nav-dragging');clearTarget();
    if(!current.active)return;
    suppressClick=true;setTimeout(()=>{suppressClick=false;},0);
    if(cancel||!current.target)return;
    current.group.root.insertBefore(current.link,current.after?current.target.nextSibling:current.target);
    current.link.focus();void save(current.group,current.before);
  }
  for(const group of groups){
    for(const link of items(group)){
      link.draggable=false;link.title='Arraste para mudar a ordem · Alt + setas';
      link.setAttribute('aria-keyshortcuts','Alt+ArrowLeft Alt+ArrowRight Alt+ArrowUp Alt+ArrowDown');
    }
    group.root.addEventListener('pointerdown',event=>{
      const link=event.target.closest(`a[${group.attribute}]`);
      if(!link||drag||pending.has(group.name)||event.button!==0||!event.isPrimary)return;
      const rect=link.getBoundingClientRect();
      drag={group,link,pointerId:event.pointerId,startX:event.clientX,startY:event.clientY,offsetX:event.clientX-rect.left,offsetY:event.clientY-rect.top,before:order(group),active:false};
      link.setPointerCapture(event.pointerId);
    });
    group.root.addEventListener('click',event=>{if(suppressClick){event.preventDefault();event.stopImmediatePropagation();}},true);
    group.root.addEventListener('dragstart',event=>event.preventDefault());
    group.root.addEventListener('keydown',event=>{
      const link=event.target.closest(`a[${group.attribute}]`);
      if(!link||!event.altKey||!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key)||pending.has(group.name))return;
      event.preventDefault();const links=items(group),before=order(group),delta=['ArrowLeft','ArrowUp'].includes(event.key)?-1:1,next=links[links.indexOf(link)+delta];
      if(next){group.root.insertBefore(link,delta<0?next:next.nextSibling);link.focus();void save(group,before);}
    });
  }
  document.addEventListener('pointermove',event=>{
    if(!drag||event.pointerId!==drag.pointerId)return;
    if(!drag.active){
      if(Math.hypot(event.clientX-drag.startX,event.clientY-drag.startY)<7)return;
      drag.active=true;const rect=drag.link.getBoundingClientRect(),ghost=drag.link.cloneNode(true);
      ghost.removeAttribute(drag.group.attribute);ghost.removeAttribute('href');ghost.removeAttribute('id');ghost.querySelectorAll('[id]').forEach(el=>el.removeAttribute('id'));
      ghost.setAttribute('aria-hidden','true');ghost.tabIndex=-1;ghost.className='navigation-ghost';
      ghost.style.width=`${rect.width}px`;ghost.style.height=`${rect.height}px`;document.body.append(ghost);drag.ghost=ghost;drag.link.classList.add('nav-dragging');
    }
    event.preventDefault();drag.ghost.style.left=`${event.clientX-drag.offsetX}px`;drag.ghost.style.top=`${event.clientY-drag.offsetY}px`;
    clearTarget();drag.target=null;
    const target=document.elementFromPoint(event.clientX,event.clientY)?.closest(`a[${drag.group.attribute}]`);
    if(!target||target===drag.link||!drag.group.root.contains(target))return;
    const rect=target.getBoundingClientRect(),vertical=drag.group.name==='navigation'&&window.innerWidth>760;
    drag.target=target;drag.after=vertical?event.clientY>rect.top+rect.height/2:event.clientX>rect.left+rect.width/2;
    target.classList.add(drag.after?'nav-drop-after':'nav-drop-before');
  });
  document.addEventListener('pointerup',event=>{if(event.pointerId===drag?.pointerId)finish();});
  document.addEventListener('pointercancel',event=>{if(event.pointerId===drag?.pointerId)finish(true);});
  document.addEventListener('lostpointercapture',event=>{if(event.pointerId===drag?.pointerId)finish(true);});
  document.addEventListener('keydown',event=>{if(event.key==='Escape'&&drag){event.preventDefault();finish(true);}});
  window.addEventListener('blur',()=>finish(true));
  return {sync(preferences){if(drag)return;for(const group of groups)if(!pending.has(group.name))apply(group,preferences?.[group.name]);}};
}
