// customers.js
import { db, auth } from './firebase-config.js';
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.11.0/firebase-auth.js";
import { collection, getDocs, doc, getDoc, query, where } from "https://www.gstatic.com/firebasejs/10.11.0/firebase-firestore.js";

// 🔴🔴🔴 ایمیل مدیریت خود را دقیقاً اینجا بنویس 🔴🔴🔴
const ADMIN_EMAIL = "ramin.paradise800@gmail.com"; 

let isAdmin = false;

const searchInput = document.getElementById('search-input');
const allCustomersView = document.getElementById('all-customers-view');
const allCustomersBody = document.getElementById('all-customers-body');
const profileContent = document.getElementById('profile-content');
const backToListBtn = document.getElementById('back-to-list-btn');

let allCustomersData = [];

// بررسی هویت به محض لود شدن صفحه
onAuthStateChanged(auth, (user) => {
    if (user) {
        document.body.style.opacity = "1"; // روشن کردن صفحه
        if (user.email.toLowerCase() === ADMIN_EMAIL.toLowerCase()) {
            isAdmin = true;
            // نمایش عناصر مخصوص ادمین
            document.querySelectorAll('.admin-only').forEach(el => {
                el.style.display = el.tagName === 'TH' ? 'table-cell' : 'block';
            });
        }
        loadAllCustomers();
    } else {
        window.location.href = "login.html";
    }
});

async function loadAllCustomers() {
    try {
        const snap = await getDocs(collection(db, "Customers"));
        allCustomersData = [];
        snap.forEach(doc => allCustomersData.push({ id: doc.id, ...doc.data() }));
        renderCustomersList(allCustomersData);
    } catch (e) {
        allCustomersBody.innerHTML = '<tr><td colspan="4" style="text-align:center; color:red;">خطا در دیتابیس</td></tr>';
    }
}

function renderCustomersList(data) {
    allCustomersBody.innerHTML = '';
    if(data.length === 0) {
        allCustomersBody.innerHTML = '<tr><td colspan="4" style="text-align:center;">مشتری یافت نشد.</td></tr>';
        return;
    }
    
    data.forEach(cust => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td style="font-weight:bold; color:#2c3e50;">${cust.name || 'نامشخص'}</td>
            <td style="direction:ltr; text-align:right;">${cust.phone}</td>
            <td>${cust.country || '-'}</td>
            <td style="text-align:center;">
                <button class="view-profile-btn" data-phone="${cust.phone}" style="background:#3498db; color:white; border:none; padding:6px 12px; border-radius:4px; cursor:pointer;">نمایش پروفایل</button>
            </td>
        `;
        allCustomersBody.appendChild(tr);
    });

    document.querySelectorAll('.view-profile-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            fetchCustomerProfile(e.target.dataset.phone);
        });
    });
}

searchInput.addEventListener('input', (e) => {
    const term = e.target.value.toLowerCase();
    const filtered = allCustomersData.filter(c => 
        (c.name || '').toLowerCase().includes(term) || (c.phone || '').includes(term)
    );
    renderCustomersList(filtered);
});

backToListBtn.addEventListener('click', () => {
    profileContent.style.display = 'none';
    allCustomersView.style.display = 'block';
    searchInput.style.display = 'block';
    searchInput.value = '';
    renderCustomersList(allCustomersData);
});

async function fetchCustomerProfile(phone) {
    allCustomersView.style.display = 'none';
    searchInput.style.display = 'none';
    profileContent.style.display = 'block';

    const colSpan = isAdmin ? "8" : "7";
    document.getElementById('customer-invoices').innerHTML = `<tr><td colspan="${colSpan}" style="text-align:center;">در حال دریافت سوابق...</td></tr>`;

    try {
        const custSnap = await getDoc(doc(db, "Customers", phone));
        if (custSnap.exists()) {
            const data = custSnap.data();
            document.getElementById('p-name').textContent = data.name || "نامشخص";
            document.getElementById('p-phone').textContent = data.phone;
            document.getElementById('p-country').textContent = data.country || "-";
            document.getElementById('p-address').textContent = data.address || "ثبت نشده";
        }

        const qRetail = query(collection(db, "Retail_Invoices"), where("customerPhone", "==", phone));
        const qWholesale = query(collection(db, "Wholesale_Invoices"), where("customerPhone", "==", phone));
        
        const [retailDocs, wholesaleDocs] = await Promise.all([getDocs(qRetail), getDocs(qWholesale)]);

        let allInvoices = [];
        retailDocs.forEach(d => allInvoices.push({ id: d.id, collectionName: "Retail_Invoices", ...d.data() }));
        wholesaleDocs.forEach(d => allInvoices.push({ id: d.id, collectionName: "Wholesale_Invoices", ...d.data() }));
        
        allInvoices.sort((a, b) => (b.timestamp?.toMillis() || 0) - (a.timestamp?.toMillis() || 0));

        let finalCount = 0, wholesaleCount = 0;
        let spentByCurrency = {}; 
        let profitByCurrency = {}; // محاسبه سود خالص مشتری
        
        const tableBody = document.getElementById('customer-invoices');
        tableBody.innerHTML = '';

        if (allInvoices.length === 0) {
            tableBody.innerHTML = `<tr><td colspan="${colSpan}" style="text-align:center;">هیچ فاکتوری برای این مشتری ثبت نشده است.</td></tr>`;
        } else {
            allInvoices.forEach(inv => {
                const isFinal = inv.status === 'نهایی';
                if (isFinal) {
                    finalCount++;
                    // مجموع خرید مشتری
                    if (!spentByCurrency[inv.currency]) spentByCurrency[inv.currency] = 0;
                    spentByCurrency[inv.currency] += inv.grandTotal;
                    
                    // مجموع سودآوری مشتری (فقط برای فاکتورهایی که سودشان محاسبه شده)
                    if (inv.isProfitCalculated && inv.netProfit !== undefined) {
                        if (!profitByCurrency[inv.currency]) profitByCurrency[inv.currency] = 0;
                        profitByCurrency[inv.currency] += inv.netProfit;
                    }
                }
                
                if (inv.invoiceType === 'wholesale') wholesaleCount++;

                const dateStr = inv.timestamp ? new Date(inv.timestamp.toDate()).toLocaleDateString('en-GB') : '-';
                const statusColor = isFinal ? '#27ae60' : '#7f8c8d';
                
                const editLink = `retail.html?edit=true&id=${inv.id}&col=${inv.collectionName}`;
                
                // تولید ستون سود فقط در صورتی که ادمین باشد
                let adminProfitTd = '';
                if (isAdmin) {
                    const profitDisplay = (inv.isProfitCalculated && inv.netProfit !== undefined) ? 
                        `<span style="color:#27ae60;">${inv.netProfit.toFixed(2)} ${inv.currency}</span>` : 
                        `<span style="color:#e67e22; font-size:12px;">در نوبت محاسبه</span>`;
                    adminProfitTd = `<td style="font-weight:bold;">${profitDisplay}</td>`;
                }

                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td style="font-weight: bold;"><a href="${editLink}" style="color: #2980b9; text-transform: uppercase; text-decoration: underline;">${inv.invoiceNumber || '-'}</a></td>
                    <td>${dateStr}</td>
                    <td>${inv.invoiceType === 'wholesale' ? 'عمده' : 'تک'}</td>
                    <td style="color:${statusColor}; font-weight:bold;">${inv.status || 'ثبت اولیه'}</td>
                    <td>${inv.salespersonName || '-'}</td>
                    <td style="font-weight:bold; color:#2980b9;">${inv.grandTotal.toFixed(2)} ${inv.currency}</td>
                    ${adminProfitTd}
                    <td style="text-align:center;"><a href="${editLink}" class="btn-small" style="background:#f39c12; padding:4px 8px; color:white; text-decoration:none; border-radius:4px; font-size:12px;">نمایش / ویرایش</a></td>
                `;
                tableBody.appendChild(tr);
            });
        }

        document.getElementById('stat-total-inv').textContent = allInvoices.length;
        document.getElementById('stat-final-inv').textContent = finalCount;
        document.getElementById('stat-wholesale-inv').textContent = wholesaleCount;

        // نمایش مبالغ خرید
        let spentText = [];
        for (const [curr, amt] of Object.entries(spentByCurrency)) spentText.push(`${amt.toFixed(2)} ${curr}`);
        document.getElementById('stat-total-spent').textContent = spentText.length > 0 ? spentText.join(" / ") : "0";

        // نمایش مبالغ سود (فقط برای ادمین رندر می‌شود)
        if (isAdmin) {
            let profitText = [];
            for (const [curr, amt] of Object.entries(profitByCurrency)) profitText.push(`${amt.toFixed(2)} ${curr}`);
            document.getElementById('stat-total-profit').textContent = profitText.length > 0 ? profitText.join(" / ") : "0";
        }

    } catch (error) {
        console.error("Profile load error:", error);
        alert("خطا در بارگذاری پروفایل مشتری.");
    }
}