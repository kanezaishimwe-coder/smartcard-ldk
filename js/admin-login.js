"use strict";

const adminLoginForm=document.getElementById("adminLoginForm");
const adminLoginMessage=document.getElementById("adminLoginMessage");
const adminLoginButton=document.getElementById("adminLoginButton");
const adminLoginButtonText=document.getElementById("adminLoginButtonText");

const ADMIN_USERNAME="headmaster";
const ADMIN_PASSWORD="CHANGE_THIS_PASSWORD";

function showAdminMessage(text,success=false){
if(!adminLoginMessage)return;

adminLoginMessage.textContent=text;
adminLoginMessage.style.color=
success?"#15803d":"#dc2626";
}

function toggleAdminPassword(){
const input=document.getElementById("adminPassword");

if(input){
input.type=
input.type==="password"?"text":"password";
}
}

adminLoginForm?.addEventListener("submit",event=>{
event.preventDefault();

const username=
document.getElementById("adminUsername")?.value.trim().toLowerCase();

const password=
document.getElementById("adminPassword")?.value||"";

if(!username||!password){
showAdminMessage(
"Enter the administrator username and password."
);
return;
}

if(
username!==ADMIN_USERNAME||
password!==ADMIN_PASSWORD
){
showAdminMessage(
"Invalid administrator credentials."
);
return;
}

if(adminLoginButton){
adminLoginButton.disabled=true;

if(adminLoginButtonText){
adminLoginButtonText.textContent="Authenticating...";
}
}

const admin={
username:ADMIN_USERNAME,
role:"Head Master",
authenticated:true,
loginTime:new Date().toISOString()
};

localStorage.setItem(
"smartCampusAdmin",
JSON.stringify(admin)
);

showAdminMessage(
"Authentication successful. Opening administration...",
true
);

setTimeout(()=>{
window.location.href="admin.html";
},700);
});

window.toggleAdminPassword=toggleAdminPassword;

if(localStorage.getItem("smartCampusAdmin")){
try{

const admin=
JSON.parse(
localStorage.getItem("smartCampusAdmin")
);

if(admin?.authenticated===true){
window.location.href="admin.html";
}

}catch{
localStorage.removeItem("smartCampusAdmin");
}
}