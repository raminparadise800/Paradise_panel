// auth.js
import { auth } from './firebase-config.js';
// اضافه شدن setPersistence و browserLocalPersistence برای ماندگاری لاگین
import { signInWithEmailAndPassword, setPersistence, browserLocalPersistence } from "https://www.gstatic.com/firebasejs/10.11.0/firebase-auth.js";

// 🔴🔴🔴 ایمیل مدیریت خود را دقیقاً اینجا بنویس (مثلا: admin@paradise.com) 🔴🔴🔴
const ADMIN_EMAIL = "ramin.paradise800@gmail.com"; 

const loginForm = document.getElementById('login-form');
const errorMessage = document.getElementById('error-message');

loginForm.addEventListener('submit', (e) => {
    e.preventDefault(); 
    
    const email = document.getElementById('email').value.trim();
    const password = document.getElementById('password').value;
    const submitBtn = loginForm.querySelector('button');
    
    submitBtn.textContent = "در حال اتصال...";
    submitBtn.disabled = true;
    errorMessage.style.display = "none"; // مخفی کردن خطای قبلی در صورت وجود
    
    // 🔥 اجبار مرورگر به ذخیره دائمی اطلاعات ورود ادمین و حسابدار 🔥
    setPersistence(auth, browserLocalPersistence)
        .then(() => {
            // انجام عملیات ورود پس از تایید ذخیره‌سازی ماندگار
            return signInWithEmailAndPassword(auth, email, password);
        })
        .then((userCredential) => {
            // بررسی سطح دسترسی بعد از ورود موفق و ماندگار
            if (userCredential.user.email.toLowerCase() === ADMIN_EMAIL.toLowerCase()) {
                window.location.href = "admin.html"; // هدایت ادمین به پنل مدیریت
            } else {
                window.location.href = "retail.html"; // هدایت حسابدار به صفحه فاکتور
            }
        })
        .catch((error) => {
            console.error(error);
            errorMessage.style.display = "block";
            submitBtn.textContent = "ورود به سیستم";
            submitBtn.disabled = false;
        });
});
