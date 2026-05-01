// admin.js
import { db, auth } from './firebase-config.js';
import { collection, addDoc, getDocs, doc, deleteDoc, setDoc } from "https://www.gstatic.com/firebasejs/10.11.0/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.11.0/firebase-auth.js";

// 🔴🔴🔴 ایمیل مدیریت خود را دقیقاً اینجا بنویس 🔴🔴🔴
const ADMIN_EMAIL = "ramin.paradise800@gmail.com"; 

const sellersList = document.getElementById('sellers-list');
const newSellerInput = document.getElementById('new-seller-name');
const addSellerBtn = document.getElementById('add-seller-btn');

// بررسی امنیت و قفل کردن صفحه
onAuthStateChanged(auth, (user) => {
    if (user) {
        if (user.email.toLowerCase() === ADMIN_EMAIL.toLowerCase()) {
            loadSellers(); // فقط اگر مدیر بود لیست لود شود
        } else {
            alert("⛔ دسترسی غیرمجاز! این بخش فقط مخصوص مدیریت است.");
            window.location.href = "retail.html"; // پرت کردن حسابدار به صفحه فاکتور
        }
    } else {
        window.location.href = "login.html";
    }
});

async function loadSellers() {
    sellersList.innerHTML = '<tr><td colspan="2" style="text-align:center; padding: 20px;">در حال بارگذاری اطلاعات... ⏳</td></tr>';
    try {
        const querySnapshot = await getDocs(collection(db, "Salespersons"));
        sellersList.innerHTML = '';
        
        if (querySnapshot.empty) {
            sellersList.innerHTML = '<tr><td colspan="2" style="text-align:center; padding: 20px; color: #7f8c8d;">هیچ فروشنده‌ای ثبت نشده است.</td></tr>';
            return;
        }

        querySnapshot.forEach((docSnap) => {
            const data = docSnap.data();
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td style="font-size: 16px; font-weight: bold; color: #333;">${data.name}</td>
                <td>
                    <div class="action-buttons">
                        <button class="btn-small edit-btn" data-id="${docSnap.id}" data-name="${data.name}" style="background-color: #f39c12; padding: 8px 15px; font-size: 13px;">ویرایش</button>
                        <button class="btn-small del-btn" data-id="${docSnap.id}" style="background-color: #e74c3c; padding: 8px 15px; font-size: 13px;">حذف</button>
                    </div>
                </td>
            `;
            sellersList.appendChild(tr);
        });

        document.querySelectorAll('.del-btn').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                if (confirm("آیا از حذف این فروشنده مطمئن هستید؟")) {
                    const btnElement = e.target;
                    btnElement.textContent = "...";
                    await deleteDoc(doc(db, "Salespersons", btnElement.dataset.id));
                    loadSellers(); 
                }
            });
        });

        document.querySelectorAll('.edit-btn').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                const currentName = e.target.dataset.name;
                const newName = prompt("نام جدید را وارد کنید:", currentName);
                if (newName && newName.trim() !== "" && newName !== currentName) {
                    await setDoc(doc(db, "Salespersons", e.target.dataset.id), { name: newName.trim() }, { merge: true });
                    loadSellers();
                }
            });
        });

    } catch (error) {
        console.error("Error fetching sellers: ", error);
        sellersList.innerHTML = '<tr><td colspan="2" style="text-align:center; color: red;">خطا در دیتابیس.</td></tr>';
    }
}

addSellerBtn.addEventListener('click', async () => {
    const name = newSellerInput.value.trim();
    if (!name) return alert("لطفاً نام فروشنده را بنویسید.");
    
    addSellerBtn.textContent = "در حال ثبت...";
    addSellerBtn.disabled = true;
    
    try {
        await addDoc(collection(db, "Salespersons"), { name: name });
        newSellerInput.value = ''; 
        loadSellers(); 
    } catch (error) {
        alert("خطا در ثبت.");
    } finally {
        addSellerBtn.textContent = "➕ افزودن به سیستم";
        addSellerBtn.disabled = false;
    }
});

newSellerInput.addEventListener('keypress', function (e) {
    if (e.key === 'Enter') addSellerBtn.click();
});