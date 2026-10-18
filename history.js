// history.js
import { db, auth } from './firebase-config.js';
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.11.0/firebase-auth.js";
import { collection, getDocs, doc, deleteDoc, updateDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.11.0/firebase-firestore.js";

// 🔴🔴🔴 ایمیل مدیریت خود را بنویس 🔴🔴🔴
const ADMIN_EMAIL = "ramin.paradise800@gmail.com"; 

const historyBody = document.getElementById('history-body');
const searchInput = document.getElementById('search-input');
const filterType = document.getElementById('filter-type');

let allInvoices = [];
let isAdmin = false;

const labels = ["ثبت اولیه", "نهایی", "کنسل شده"];
// منابع پیش‌فرض بازاریابی
const baseLeadSources = ["اینستاگرام", "گوگل", "تلگرام", "تیک‌تاک", "یوتیوب", "قدیمی", "معرفی"];

onAuthStateChanged(auth, (user) => {
    if (user) {
        if (user.email.toLowerCase() === ADMIN_EMAIL.toLowerCase()) isAdmin = true;
        loadInvoices();
    } else window.location.href = "login.html";
});

async function loadInvoices() {
    historyBody.innerHTML = '<tr><td colspan="10" style="text-align:center;">در حال بارگذاری...</td></tr>';
    allInvoices = [];
    try {
        const retailSnap = await getDocs(collection(db, "Retail_Invoices"));
        retailSnap.forEach(doc => allInvoices.push({ id: doc.id, collectionName: "Retail_Invoices", ...doc.data() }));

        const wholesaleSnap = await getDocs(collection(db, "Wholesale_Invoices"));
        wholesaleSnap.forEach(doc => allInvoices.push({ id: doc.id, collectionName: "Wholesale_Invoices", ...doc.data() }));

        allInvoices.sort((a, b) => (b.timestamp?.toMillis() || 0) - (a.timestamp?.toMillis() || 0));
        renderTable(allInvoices);
    } catch (e) { historyBody.innerHTML = '<tr><td colspan="10" style="text-align:center; color: red;">خطا در ارتباط با سرور</td></tr>'; }
}

function renderTable(data) {
    historyBody.innerHTML = '';
    if (data.length === 0) return historyBody.innerHTML = '<tr><td colspan="10" style="text-align:center;">موردی یافت نشد.</td></tr>';

    // استخراج منابع جدیدی که قبلا در دیتابیس ثبت شده‌اند تا به لیست پیش‌فرض اضافه شوند
    const dynamicSources = new Set(baseLeadSources);
    allInvoices.forEach(inv => {
        if (inv.leadSource && inv.leadSource.trim() !== '') {
            dynamicSources.add(inv.leadSource);
        }
    });
    const finalSourcesList = Array.from(dynamicSources);

    data.forEach(inv => {
        const tr = document.createElement('tr');
        const dateStr = inv.timestamp ? new Date(inv.timestamp.toDate()).toLocaleDateString('en-GB') : '-';
        
        // دکمه ویرایش (قابل دسترسی برای حسابدار و مدیر)
        const editBtn = `<a href="retail.html?edit=true&id=${inv.id}&col=${inv.collectionName}" class="btn-small" style="background:#f39c12; padding:6px 10px; color:white; text-decoration:none; border-radius:4px; margin-left:5px;">ویرایش</a>`;
        const delBtn = isAdmin ? `<button class="btn-small del-btn" data-id="${inv.id}" data-col="${inv.collectionName}" style="background:#e74c3c; padding:6px 10px;">حذف</button>` : '';
        const actionBtns = isAdmin ? editBtn + delBtn : editBtn;

        const weightDisplay = inv.totalWeight ? `${inv.totalWeight}` : '0';
        const sellerName = inv.salespersonName || '-'; 

        let statusOptions = '';
        labels.forEach(lbl => {
            statusOptions += `<option value="${lbl}" ${inv.status === lbl ? 'selected' : ''}>${lbl}</option>`;
        });

        // ساخت لیست کشویی منابع جذب مشتری
        let sourceOptions = `<option value="">انتخاب...</option>`;
        finalSourcesList.forEach(src => {
            sourceOptions += `<option value="${src}" ${inv.leadSource === src ? 'selected' : ''}>${src}</option>`;
        });
        sourceOptions += `<option value="add_new" style="background:#f1f2f6; font-weight:bold; color:#2980b9;">➕ منبع جدید...</option>`;

        tr.innerHTML = `
            <td style="font-weight: bold; color: #2980b9;">${inv.invoiceNumber || '-'}</td>
            <td>${dateStr}</td>
            <td><strong>${inv.customerName || 'Unknown'}</strong><br><span style="font-size:12px; color:#7f8c8d;">${inv.customerPhone}</span></td>
            <td>${inv.customerCountry || '-'}</td>
            <td style="font-weight: bold; color:#8e44ad;">${sellerName}</td>
            <td style="color: #d35400; font-weight: bold;">${weightDisplay}</td>
            <td>
                <select class="source-select" data-id="${inv.id}" data-col="${inv.collectionName}" style="background: #fdf2e9; border: 1px solid #e67e22;">
                    ${sourceOptions}
                </select>
            </td>
            <td>
                <select class="status-select ${inv.status === 'نهایی' ? 'status-نهایی' : ''}" data-id="${inv.id}" data-col="${inv.collectionName}">
                    ${statusOptions}
                </select>
            </td>
            <td style="font-weight:bold; color:#27ae60;">${inv.grandTotal.toFixed(2)} ${inv.currency}</td>
            <td style="text-align: center;">${actionBtns}</td>
        `;
        historyBody.appendChild(tr);
    });

    // رویداد تغییر وضعیت فاکتور (همراه با ثبت تاریخ دقیق نهایی شدن)
    document.querySelectorAll('.status-select').forEach(select => {
        select.addEventListener('change', async (e) => {
            const newStatus = e.target.value;
            const docId = e.target.dataset.id;
            const colName = e.target.dataset.col;
            if(newStatus === 'نهایی') e.target.classList.add('status-نهایی');
            else e.target.classList.remove('status-نهایی');

            try {
                const updatePayload = { status: newStatus };
                if (newStatus === 'نهایی') {
                    updatePayload.finalizedAt = serverTimestamp();
                }

                await updateDoc(doc(db, colName, docId), updatePayload);
                const invIndex = allInvoices.findIndex(i => i.id === docId && i.collectionName === colName);
                if(invIndex > -1) {
                    allInvoices[invIndex].status = newStatus;
                    if (newStatus === 'نهایی') {
                        allInvoices[invIndex].finalizedAt = { toMillis: () => Date.now(), toDate: () => new Date() };
                    }
                }
            } catch (error) { alert("خطا در تغییر وضعیت"); }
        });
    });

    // رویداد تغییر منبع مشتری (Lead Source)
    document.querySelectorAll('.source-select').forEach(select => {
        select.addEventListener('change', async (e) => {
            let newValue = e.target.value;
            const docId = e.target.dataset.id;
            const colName = e.target.dataset.col;

            if (newValue === 'add_new') {
                const customSource = prompt("لطفاً نام منبع جدید را وارد کنید (مثلاً: فیسبوک):");
                if (customSource && customSource.trim() !== '') {
                    newValue = customSource.trim();
                } else {
                    // اگر منصرف شد، برگردد به مقدار قبلی
                    const inv = allInvoices.find(i => i.id === docId && i.collectionName === colName);
                    e.target.value = inv.leadSource || '';
                    return;
                }
            }

            try {
                e.target.disabled = true; // قفل موقت تا ذخیره در دیتابیس انجام شود
                await updateDoc(doc(db, colName, docId), { leadSource: newValue });
                
                // آپدیت حافظه موقت سیستم
                const invIndex = allInvoices.findIndex(i => i.id === docId && i.collectionName === colName);
                if(invIndex > -1) allInvoices[invIndex].leadSource = newValue;
                
                e.target.disabled = false;
                applyFilters(); // رفرش جدول تا منبع جدید در لیست همه کشویی‌ها ظاهر شود
                
            } catch (error) { 
                alert("خطا در ثبت منبع"); 
                e.target.disabled = false;
            }
        });
    });

    document.querySelectorAll('.del-btn').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            if (confirm("حذف فاکتور؟")) {
                await deleteDoc(doc(db, e.target.dataset.col, e.target.dataset.id));
                loadInvoices();
            }
        });
    });
}

function applyFilters() {
    const searchTerm = searchInput.value.toLowerCase();
    const selectedType = filterType.value;

    const filteredData = allInvoices.filter(inv => {
        const matchName = (inv.customerName || "").toLowerCase().includes(searchTerm);
        const matchPhone = (inv.customerPhone || "").includes(searchTerm);
        const matchInvNo = (inv.invoiceNumber || "").toLowerCase().includes(searchTerm);
        const matchSeller = (inv.salespersonName || "").toLowerCase().includes(searchTerm);
        const matchSearch = matchName || matchPhone || matchInvNo || matchSeller;
        const matchType = selectedType === "all" || inv.invoiceType === selectedType;
        return matchSearch && matchType;
    });
    renderTable(filteredData);
}

searchInput.addEventListener('input', applyFilters);
filterType.addEventListener('change', applyFilters);
