"use strict";
const TOKEN_KEY = "docuguard_access_token";
let token = sessionStorage.getItem(TOKEN_KEY);
let currentUser = null;
let documents = [];
let selectedDocument = null;
let currentView = "overview";
const $ = (id) => document.getElementById(id);
const byId = (id) => $(id);

function message(text, isError = false) {
  const box = $("message");
  if (!box) return;
  box.textContent = text;
  box.classList.toggle("error", isError);
  box.classList.remove("hidden");
  window.clearTimeout(message.timer);
  message.timer = window.setTimeout(() => box.classList.add("hidden"), 5500);
}
function hideMessage() { $("message")?.classList.add("hidden"); }
function showAuth(mode = "login") {
  if (token) return;
  $("landingSection").classList.add("hidden");
  $("authSection").classList.remove("hidden");
  $("landingFooter").classList.add("hidden");
  $("loginPanel").classList.toggle("hidden", mode !== "login");
  $("registerPanel").classList.toggle("hidden", mode !== "register");
  $("authTitle").textContent = mode === "register" ? "Create your account" : "Welcome back";
  $("authSubtitle").textContent = mode === "register" ? "Create your secure DocuGuard workspace." : "Sign in to continue to your workspace.";
  hideMessage(); window.scrollTo({top:0,behavior:"smooth"});
}
function showLanding() {
  $("landingSection").classList.remove("hidden");
  $("authSection").classList.add("hidden");
  $("landingFooter").classList.remove("hidden");
  $("workspace").classList.add("hidden");
  window.scrollTo({top:0,behavior:"smooth"});
}
function renderAuth() {
  const signedIn = Boolean(token);
  $("landingSection").classList.toggle("hidden", signedIn);
  $("landingFooter").classList.toggle("hidden", signedIn);
  $("authSection").classList.add("hidden");
  $("workspace").classList.toggle("hidden", !signedIn);
  $("logoutBtn").classList.toggle("hidden", !signedIn);
  $("topSignInBtn").classList.toggle("hidden", signedIn);
  $("userLabel").textContent = currentUser ? `${currentUser.full_name} · ${currentUser.role}` : "Guest access";
  if (currentUser) {
    const initials = currentUser.full_name.split(/\s+/).slice(0,2).map(p=>p[0]).join("").toUpperCase();
    $("userAvatar").textContent = initials;
    $("sidebarUserName").textContent = currentUser.full_name;
    $("sidebarUserRole").textContent = currentUser.role;
    $("welcomeTitle").textContent = `Welcome back, ${currentUser.full_name.split(/\s+/)[0]}.`;
  }
}
function clearSession() {
  token = null; currentUser = null; documents = []; selectedDocument = null;
  sessionStorage.removeItem(TOKEN_KEY);
}
function detailMessage(data) {
  if (typeof data?.detail === "string") return data.detail;
  if (Array.isArray(data?.detail)) return data.detail.map(x=>x.msg || "Invalid input").join("; ");
  return data?.message || "Request failed. Please try again.";
}
async function api(path, options = {}) {
  const headers = new Headers(options.headers || {});
  if (token) headers.set("Authorization", `Bearer ${token}`);
  if (options.body && !(options.body instanceof FormData)) headers.set("Content-Type", "application/json");
  const response = await fetch(path, {...options, headers});
  if (response.status === 401 && token && !path.startsWith("/auth/login")) {
    clearSession(); renderAuth(); showLanding();
    throw new Error("Your session has expired. Please sign in again.");
  }
  if (!response.ok) {
    let data = {}; try { data = await response.json(); } catch {}
    throw new Error(detailMessage(data));
  }
  if (response.status === 204) return null;
  const type = response.headers.get("content-type") || "";
  return type.includes("application/json") ? response.json() : response;
}
async function withBusy(form, task) {
  hideMessage(); const button = form.querySelector('button[type="submit"]');
  const old = button?.textContent; if (button) { button.disabled = true; button.textContent = "Please wait…"; }
  try { await task(new FormData(form)); } catch (e) { message(e.message || "Something went wrong.", true); }
  finally { if (button) { button.disabled = false; button.textContent = old; } }
}
async function checkHealth() {
  try {
    const r = await fetch("/health/db");
    $("serverStatus").textContent = r.ok ? "Service online" : "Service needs attention";
    $("serverDot").classList.toggle("online", r.ok);
  } catch {
    $("serverStatus").textContent = "Service unavailable";
    $("serverDot").classList.remove("online");
  }
}
function dateLabel(value) {
  if (!value) return "—"; const d = new Date(value);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString(undefined,{year:"numeric",month:"short",day:"numeric"});
}
function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
}
function fileType(doc) {
  const name = (doc.title || "").toLowerCase();
  if (name.endsWith(".pdf")) return "PDF";
  if (name.endsWith(".txt")) return "TXT";
  if (/\.(png|jpg|jpeg)$/.test(name)) return "IMG";
  return "DOC";
}
function iconClass(type) { return type === "TXT" ? "txt" : type === "IMG" ? "image" : ""; }
function documentIcon(doc) { const t=fileType(doc); return `<span class="doc-mini-icon ${iconClass(t)}">${t}</span>`; }
function owned(doc) { return doc.is_owner === true || (currentUser && doc.owner_id === currentUser.id); }
function renderDocuments() {
  const q = ($("searchQuery")?.value || "").trim().toLowerCase();
  const cat = $("categoryFilter")?.value || "";
  const visible = documents.filter(d => (!q || (d.title||"").toLowerCase().includes(q) || (d.category||"").toLowerCase().includes(q)) && (!cat || d.category === cat));
  const body = $("documentTableBody");
  if (body) {
    body.innerHTML = visible.length ? visible.map(d => `<tr><td><div class="doc-cell">${documentIcon(d)}<div><b>${escapeHtml(d.title)}</b><small>Document ID: ${d.id}</small></div></div></td><td>${escapeHtml(d.category || "General")}</td><td><span class="owner-badge">${owned(d)?"You":"Shared with you"}</span></td><td>${dateLabel(d.created_at)}</td><td><span class="status-badge ${owned(d)?"":"shared"}">${owned(d)?"Private":"Shared"}</span></td><td><div class="row-actions"><button type="button" data-action="download" data-id="${d.id}">Download</button><button type="button" data-action="select" data-id="${d.id}">Select</button></div></td></tr>`).join("") : `<tr><td colspan="6" class="table-empty">${q||cat?"No documents match your search.":"No documents yet. Upload your first file."}</td></tr>`;
  }
  const recent = $("recentDocuments");
  if (recent) {
    const latest = [...documents].sort((a,b)=>new Date(b.created_at||0)-new Date(a.created_at||0)).slice(0,5);
    recent.innerHTML = latest.length ? latest.map(d=>`<div class="recent-row">${documentIcon(d)}<div class="recent-meta"><b>${escapeHtml(d.title)}</b><small>${escapeHtml(d.category||"General")} · ${dateLabel(d.created_at)} · ${owned(d)?"Owned by you":"Shared with you"}</small></div><div class="row-actions"><button type="button" data-action="download" data-id="${d.id}">Download</button></div></div>`).join("") : `<div class="empty-state"><span>▤</span><b>No documents yet</b><p>Upload your first file to get started.</p></div>`;
  }
  const shared = $("sharedDocuments");
  if (shared) {
    const rows=documents.filter(d=>!owned(d));
    shared.innerHTML=rows.length?rows.map(d=>`<div class="shared-item">${documentIcon(d)}<div><b>${escapeHtml(d.title)}</b><small>${escapeHtml(d.category||"General")} · ${dateLabel(d.created_at)}</small></div><button class="button button-outline" data-action="download" data-id="${d.id}" type="button">Download</button></div>`).join(""):`<div class="empty-state"><span>♧</span><b>No shared files found</b><p>Documents shared with you will appear here.</p></div>`;
  }
  $("documentCount").textContent=String(documents.length);
  $("ownedCount").textContent=String(documents.filter(owned).length);
  $("sharedCount").textContent=String(documents.filter(d=>!owned(d)).length);
  const ownDocs=documents.filter(owned);
  ["accessDocumentSelect","auditDocumentSelect"].forEach(id=>{
    const el=$(id); if(!el)return; const prev=el.value;
    el.innerHTML=`<option value="">Select a document…</option>`+ownDocs.map(d=>`<option value="${d.id}">${escapeHtml(d.title)} (#${d.id})</option>`).join("");
    if(ownDocs.some(d=>String(d.id)===prev))el.value=prev;
  });
  updateAuditButtons();
}
async function loadDocuments(search = "") {
  const params=new URLSearchParams(); if(search.trim())params.set("q",search.trim());
  const result=await api(`/documents/${params.toString()?`search?${params}`:""}`);
  if(!Array.isArray(result))throw new Error("The server returned an unexpected document list.");
  documents=result; renderDocuments();
}
function updateAuditButtons() {
  const id=$("auditDocumentSelect")?.value;
  const enabled=Boolean(id);
  $("auditBtn").disabled=!enabled; $("verifyBtn").disabled=!enabled;
}
function setView(view) {
  currentView=view;
  const titles={overview:"Overview",documents:"My documents",shared:"Shared files",access:"Access control",audit:"Audit trail"};
  Object.entries({overview:"dashboardView",documents:"documentsView",shared:"sharedView",access:"accessView",audit:"auditView"}).forEach(([key,id])=>$(id).classList.toggle("hidden",key!==view));
  document.querySelectorAll(".side-link").forEach(b=>b.classList.toggle("active",b.dataset.view===view));
  $("pageTitle").textContent=titles[view]||"Overview"; $("pageBreadcrumb").textContent=titles[view]||"Overview";
  if(view==="documents")loadDocuments().catch(e=>message(e.message,true));
  if(view==="shared")loadDocuments().catch(e=>message(e.message,true));
  window.scrollTo({top:0,behavior:"smooth"});
}
async function downloadDocument(id) {
  try {
    const response=await api(`/documents/${id}/download`);
    const blob=await response.blob(); const url=URL.createObjectURL(blob);
    const doc=documents.find(d=>String(d.id)===String(id)); const a=document.createElement("a");
    a.href=url;a.download=doc?.title||`document-${id}`;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
    message("Your download has started.");
  } catch(e){message(e.message,true);}
}
async function uploadDocument(form) {
  const file=form.get("file"); const title=String(form.get("title")||"").trim(); const category=String(form.get("category")||"General");
  if(!(file instanceof File)||!file.size)throw new Error("Choose a file before uploading.");
  if(file.size>10*1024*1024)throw new Error("The maximum file size is 10 MB.");
  const allowed=["application/pdf","text/plain","image/png","image/jpeg"];
  if(!allowed.includes(file.type))throw new Error("Only PDF, TXT, PNG and JPEG files are supported.");
  // The current FastAPI endpoint accepts title/category as query parameters and the file as multipart data.
  const params=new URLSearchParams({title,category}); const body=new FormData(); body.append("file",file,file.name);
  await api(`/documents/upload?${params.toString()}`,{method:"POST",body});
  $("uploadForm").reset(); $("fileNameLabel").textContent="Choose a file to upload"; $("uploadDialog").close();
  await loadDocuments(); setView("documents"); message("Document uploaded securely.");
}
async function loadAudit() {
  const id=$("auditDocumentSelect").value; if(!id)return;
  try {
    const events=await api(`/documents/${id}/audit`); const holder=$("auditEvents");
    holder.innerHTML=events.length?events.map(ev=>`<div class="audit-event"><span class="audit-event-icon">◷</span><div><b>${escapeHtml((ev.action||"Activity").replaceAll("_"," "))}</b><small>${escapeHtml(ev.details||"No additional details")}<br>Event #${ev.id} · Actor ${ev.actor_id??"system"}</small></div><time>${escapeHtml(new Date(ev.created_at).toLocaleString())}</time></div>`).join(""):`<div class="empty-state"><span>◷</span><b>No events recorded</b><p>Actions on this document will appear here.</p></div>`;
    $("auditOutput").textContent=JSON.stringify(events,null,2); $("auditOutput").classList.remove("hidden"); message("Audit events loaded.");
  } catch(e){message(e.message,true);}
}
async function verifyAudit() {
  const id=$("auditDocumentSelect").value;if(!id)return;
  try {const result=await api(`/documents/${id}/audit/verify`);const box=$("auditVerification");box.classList.remove("hidden","invalid");if(!result.is_valid)box.classList.add("invalid");box.innerHTML=`<b>${result.is_valid?"✓ Audit chain verified":"! Audit verification failed"}</b>${escapeHtml(result.message||"")}<br>Verified ${result.verified_events??0} of ${result.total_events??0} events.`;message(result.is_valid?"Audit integrity verified.":"Audit verification found an issue.",!result.is_valid);}catch(e){message(e.message,true);}
}
async function logout() { clearSession(); renderAuth(); showLanding(); setView("overview"); message("You have signed out."); }

$("landingSignInBtn").addEventListener("click",()=>showAuth("login"));
$("topSignInBtn").addEventListener("click",()=>showAuth("login"));
$("landingCreateBtn").addEventListener("click",()=>showAuth("register"));
$("backToLandingBtn").addEventListener("click",showLanding);
$("switchToRegisterBtn").addEventListener("click",()=>showAuth("register"));
$("switchToLoginBtn").addEventListener("click",()=>showAuth("login"));
$("homeBtn").addEventListener("click",e=>{e.preventDefault();if(token)setView("overview");else showLanding();});
$("sidebarHome").addEventListener("click",e=>{e.preventDefault();setView("overview");});
$("logoutBtn").addEventListener("click",logout); $("sidebarLogoutBtn").addEventListener("click",logout);
document.querySelectorAll("[data-view]").forEach(btn=>btn.addEventListener("click",()=>setView(btn.dataset.view)));
$("registerForm").addEventListener("submit",e=>{e.preventDefault();const form=e.currentTarget;withBusy(form,async data=>{await api("/auth/register",{method:"POST",body:JSON.stringify({full_name:String(data.get("full_name")).trim(),email:String(data.get("email")).trim(),password:String(data.get("password"))})});form.reset();showAuth("login");message("Account created. Please sign in with your new credentials.");});});
$("loginForm").addEventListener("submit",e=>{e.preventDefault();const form=e.currentTarget;withBusy(form,async data=>{const result=await api("/auth/login",{method:"POST",body:JSON.stringify({email:String(data.get("email")).trim(),password:String(data.get("password"))})});if(!result.access_token)throw new Error("The server did not return an access token.");token=result.access_token;sessionStorage.setItem(TOKEN_KEY,token);try{currentUser=await api("/auth/me");renderAuth();form.reset();setView("overview");await loadDocuments();message(`Welcome, ${currentUser.full_name}!`);}catch(err){clearSession();renderAuth();showAuth("login");throw err;}});});
$("newUploadBtn").addEventListener("click",()=>{if(!token){showAuth("login");return;}$("uploadDialog").showModal();});
$("quickUploadBtn").addEventListener("click",()=>$("uploadDialog").showModal());
$("closeUploadBtn").addEventListener("click",()=>$("uploadDialog").close());$("cancelUploadBtn").addEventListener("click",()=>$("uploadDialog").close());
$("uploadFile").addEventListener("change",e=>{$("fileNameLabel").textContent=e.target.files[0]?.name||"Choose a file to upload";});
$("uploadForm").addEventListener("submit",e=>{e.preventDefault();withBusy(e.currentTarget,uploadDocument);});
$("documentTableBody").addEventListener("click",e=>{const b=e.target.closest("button[data-action]");if(!b)return;const d=documents.find(x=>String(x.id)===b.dataset.id);if(!d)return;if(b.dataset.action==="download")downloadDocument(d.id);else{selectedDocument=d;$("accessDocumentSelect").value=owned(d)?String(d.id):"";$("auditDocumentSelect").value=owned(d)?String(d.id):"";setView(owned(d)?"access":"shared");}});
$("recentDocuments").addEventListener("click",e=>{const b=e.target.closest("button[data-action]");if(b)downloadDocument(b.dataset.id);});
$("sharedDocuments").addEventListener("click",e=>{const b=e.target.closest("button[data-action]");if(b)downloadDocument(b.dataset.id);});
$("searchQuery").addEventListener("input",renderDocuments);$("categoryFilter").addEventListener("change",renderDocuments);
$("globalSearch").addEventListener("keydown",e=>{if(e.key==="Enter"){e.preventDefault();$("searchQuery").value=e.target.value;setView("documents");loadDocuments(e.target.value).catch(err=>message(err.message,true));}});
$("clearSearchBtn").addEventListener("click",()=>{$("searchQuery").value="";$("categoryFilter").value="";loadDocuments().then(()=>message("Filters cleared.")).catch(e=>message(e.message,true));});
$("refreshBtn").addEventListener("click",()=>loadDocuments().then(()=>message("Documents refreshed.")).catch(e=>message(e.message,true)));
$("refreshSharedBtn").addEventListener("click",()=>loadDocuments().then(()=>message("Shared files refreshed.")).catch(e=>message(e.message,true)));
$("accessDocumentSelect").addEventListener("change",()=>{selectedDocument=documents.find(d=>String(d.id)===$("accessDocumentSelect").value)||null;});
$("shareForm").addEventListener("submit",e=>{e.preventDefault();const form=e.currentTarget;withBusy(form,async data=>{const id=$("accessDocumentSelect").value;if(!id)throw new Error("Select a document you own first.");const userId=Number(data.get("user_id"));if(!Number.isInteger(userId)||userId<1)throw new Error("Enter a valid recipient user ID.");const result=await api(`/documents/${id}/share`,{method:"POST",body:JSON.stringify({user_id:userId,can_read:data.get("can_read")==="on",can_edit:data.get("can_edit")==="on"})});form.reset();message(result.message||"Access granted successfully.");});});
$("revokeForm").addEventListener("submit",e=>{e.preventDefault();const form=e.currentTarget;withBusy(form,async data=>{const id=$("accessDocumentSelect").value;const userId=Number(data.get("user_id"));if(!id)throw new Error("Select a document you own first.");if(!Number.isInteger(userId)||userId<1)throw new Error("Enter a valid recipient user ID.");if(!confirm(`Revoke access to this document for user ${userId}?`))return;await api(`/documents/${id}/share/${userId}`,{method:"DELETE"});form.reset();message("Access revoked immediately.");});});
$("auditDocumentSelect").addEventListener("change",()=>{updateAuditButtons();$("auditEvents").innerHTML=`<div class="empty-state"><span>◷</span><b>Ready to inspect</b><p>Load audit events for the selected document.</p></div>`;$("auditVerification").classList.add("hidden");$("auditOutput").classList.add("hidden");});
$("auditBtn").addEventListener("click",loadAudit);$("verifyBtn").addEventListener("click",verifyAudit);
$("yearNow").textContent=new Date().getFullYear();$("landingYear").textContent=new Date().getFullYear();
async function init(){await checkHealth();if(!token){showLanding();return;}try{currentUser=await api("/auth/me");renderAuth();await loadDocuments();setView("overview");}catch(e){clearSession();renderAuth();showLanding();message(e.message,true);}}
init();
