const button=document.querySelector('#keyboard-toggle');
button.addEventListener('click',async()=>{button.disabled=true;try{button.classList.toggle('active',await window.moonlightOverlay.toggleKeyboard())}finally{button.disabled=false}});
window.moonlightOverlay.onState(visible=>button.classList.toggle('active',visible));
