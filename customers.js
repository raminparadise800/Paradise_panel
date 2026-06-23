// customers.js
import { db, auth } from './firebase-config.js';
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.11.0/firebase-auth.js";
import { collection, getDocs, doc, getDoc, query, where } from "https://www.gstatic.com/firebasejs/10.11.0/firebase-firestore.js";

// 🔴🔴🔴 ایمیل مدیریت خود را دقیقاً اینجا بنویس 🔴🔴🔴
const ADMIN_EMAIL = "ramin.paradise800@gmail.com"; 

let isAdmin = false;

const searchInput = document.getElementById('search-input');
const sortSelect = document.getElementById('sort-select'); 
const allCustomersView = document.getElementById('all-customers-view');
const allCustomersBody = document.getElementById('all-customers-body');
const profileContent = document.getElementById('profile-content');
const backToListBtn = document.getElementById('back-to-list-btn');

let allCustomersData = [];
let exchangeRates = null; 
const currencyCodes = { "€": "EUR", "£": "GBP", "$": "USD", "₺": "TRY" };

onAuthStateChanged(auth, async (user) => {
    if (user) {
        document.body.style.opacity = "1"; 
        if (user.email.toLowerCase() === ADMIN_EMAIL.toLowerCase()) {
            isAdmin = true;
            document.querySelectorAll('.admin-only').forEach(el => {
                el.style.display = el.tagName === 'TH' ? 'table-cell' : 'block';
            });
        }
        await fetchExchangeRates(); 
        loadAllCustomers();
    } else {
        window.location.href = "login.html";
    }
});

async function fetchExchangeRates() {
    try {
        const response = await fetch(`https://open.er-api.com/v6/latest/EUR`);
        const data = await response.json();
        exchangeRates = data.rates;
    } catch (e) { console.error("Exchange API Error:", e); }
}

function convertToEuro(amount, currencySymbol) {
    if (!amount || !exchangeRates) return amount || 0;
    const code = currencyCodes[currencySymbol] || "EUR";
    if (code === "EUR") return amount;
    return amount / exchangeRates[code]; 
}

async function loadAllCustomers() {
    try {
        const snap = await getDocs(collection(db, "Customers"));
        let tempCustomers = [];
        snap.forEach(doc => tempCustomers.push({ id: doc.id, ...doc.data(), totalSpentEUR: 0, displaySpent: "0.00 €", hasFinalPurchase: false }));

        const qRetail = query(collection(db, "Retail_Invoices"), where("status", "==", "نهایی"));
        const qWholesale = query(collection(db, "Wholesale_Invoices"), where("status", "==", "نهایی"));
        const [retSnap, whoSnap] = await Promise.all([getDocs(qRetail), getDocs(qWholesale)]);
        
        let allFinalInvoices = [];
        retSnap.forEach(d => allFinalInvoices.push(d.data()));
        whoSnap.forEach(d => allFinalInvoices.push(d.data()));

        tempCustomers.forEach(cust => {
            let totalEurCalc = 0; // متغیر تجمیع کل خریدها به یورو

            allFinalInvoices.forEach(inv => {
                if (inv.customerPhone === cust.phone) {
                    cust.hasFinalPurchase = true; 
                    // تبدیل هر نوع ارزی به یورو و جمع زدن آن
                    totalEurCalc += convertToEuro(inv.grandTotal, inv.currency);
                }
            });

            cust.totalSpentEUR = totalEurCalc; 
            // نمایش یکپارچه و تمیز عدد نهایی
            cust.displaySpent = totalEurCalc > 0 ? `${totalEurCalc.toFixed(2)} €` : "0.00 €";
        });

        allCustomersData = tempCustomers;
        
        sortSelect.value = "spent-high"; 
        applyFiltersAndSort();

    } catch (e) {
        console.error(e);
        allCustomersBody.innerHTML = '<tr><td colspan="6" style="text-align:center; color:red;">خطا در دریافت اطلاعات دیتابیس</td></tr>';
    }
}

function renderCustomersList(data) {
    allCustomersBody.innerHTML = '';
    if(data.length === 0) {
        allCustomersBody.innerHTML = '<tr><td colspan="6" style="text-align:center;">مشتری یافت نشد.</td></tr>';
        return;
    }
    
    data.forEach(cust => {
        const phoneClass = cust.hasFinalPurchase ? "phone-highlight-green" : "phone-normal";
        const statusBadge = cust.hasFinalPurchase 
            ? `<span class="badge badge-success">مشتری فعال</span>` 
            : `<span class="badge badge-secondary">بدون خرید نهایی</span>`;

        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td style="font-weight:bold; color:#2c3e50; font-size:15px;">${cust.name || 'نامشخص'}</td>
            <td class="${phoneClass}" style="direction:ltr; text-align:right; font-size:15px;">${cust.phone}</td>
            <td style="color:#555;">${cust.country || '-'}</td>
            <td class="total-spent-cell">${cust.displaySpent}</td>
            <td style="text-align:center;">${statusBadge}</td>
            <td style="text-align:center;">
                <button class="view-profile-btn" data-phone="${cust.phone}" style="background:#3498db; color:white; border:none; padding:6px 15px; border-radius:4px; cursor:pointer; font-weight:bold; transition: 0.2s;">مشاهده پرونده</button>
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

function applyFiltersAndSort() {
    const term = searchInput.value.toLowerCase();
    const sortType = sortSelect.value;

    let result = allCustomersData.filter(c => 
        (c.name || '').toLowerCase().includes(term) || 
        (c.phone || '').includes(term) ||
        (c.country || '').toLowerCase().includes(term)
    );

    if (sortType === 'spent-high') {
        result.sort((a, b) => b.totalSpentEUR - a.totalSpentEUR);
    } else if (sortType === 'spent-low') {
        result.sort((a, b) => a.totalSpentEUR - b.totalSpentEUR);
    } else if (sortType === 'name-asc') {
        result.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    } 

    renderCustomersList(result);
}

searchInput.addEventListener('input', applyFiltersAndSort);
sortSelect.addEventListener('change', applyFiltersAndSort);

backToListBtn.addEventListener('click', () => {
    profileContent.style.display = 'none';
    allCustomersView.style.display = 'block';
    document.querySelector('.search-sort-container').style.display = 'flex';
    searchInput.value = '';
    applyFiltersAndSort(); 
});

async function fetchCustomerProfile(phone) {
    allCustomersView.style.display = 'none';
    document.querySelector('.search-sort-container').style.display = 'none';
    profileContent.style.display = 'block';

    const colSpan = isAdmin ? "8" : "7";
    document.getElementById('customer-invoices').innerHTML = `<tr><td colspan="${colSpan}" style="text-align:center; padding: 20px;">در حال دریافت سوابق دقیق... ⏳</td></tr>`;

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
        let totalSpentEurProfile = 0; 
        let totalProfitEurProfile = 0; 
        
        const tableBody = document.getElementById('customer-invoices');
        tableBody.innerHTML = '';

        if (allInvoices.length === 0) {
            tableBody.innerHTML = `<tr><td colspan="${colSpan}" style="text-align:center;">هیچ فاکتوری برای این مشتری ثبت نشده است.</td></tr>`;
        } else {
            allInvoices.forEach(inv => {
                const isFinal = inv.status === 'نهایی';
                if (isFinal) {
                    finalCount++;
                    // تجمیع کل مبالغ به یورو در پروفایل
                    totalSpentEurProfile += convertToEuro(inv.grandTotal, inv.currency);
                    
                    if (inv.isProfitCalculated && inv.netProfit !== undefined) {
                        totalProfitEurProfile += convertToEuro(inv.netProfit, inv.currency);
                    }
                }
                
                if (inv.invoiceType === 'wholesale') wholesaleCount++;

                const dateStr = inv.timestamp ? new Date(inv.timestamp.toDate()).toLocaleDateString('en-GB') : '-';
                const statusColor = isFinal ? '#27ae60' : '#7f8c8d';
                
                const editLink = `retail.html?edit=true&id=${inv.id}&col=${inv.collectionName}`;
                
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
                    <td><span style="font-size: 12px; padding: 3px 6px; border-radius: 4px; background: ${inv.invoiceType === 'wholesale' ? '#f5eef8; color: #8e44ad;' : '#ebf5fb; color: #2980b9;'}">${inv.invoiceType === 'wholesale' ? 'عمده' : 'تک'}</span></td>
                    <td style="color:${statusColor}; font-weight:bold;">${inv.status || 'ثبت اولیه'}</td>
                    <td>${inv.salespersonName || '-'}</td>
                    <td style="font-weight:bold; color:#2980b9;">${inv.grandTotal.toFixed(2)} ${inv.currency}</td>
                    ${adminProfitTd}
                    <td style="text-align:center;"><a href="${editLink}" class="btn-small" style="background:#f39c12; padding:6px 12px; color:white; text-decoration:none; border-radius:4px; font-size:12px; font-weight: bold;">نمایش / ویرایش</a></td>
                `;
                tableBody.appendChild(tr);
            });
        }

        document.getElementById('stat-total-inv').textContent = allInvoices.length;
        document.getElementById('stat-final-inv').textContent = finalCount;
        document.getElementById('stat-wholesale-inv').textContent = wholesaleCount;

        // نمایش یکپارچه مقادیر به یورو در پروفایل مشتری
        document.getElementById('stat-total-spent').textContent = totalSpentEurProfile > 0 ? `${totalSpentEurProfile.toFixed(2)} €` : "0.00 €";

        if (isAdmin) {
            document.getElementById('stat-total-profit').textContent = totalProfitEurProfile > 0 ? `${totalProfitEurProfile.toFixed(2)} €` : "0.00 €";
        }

    } catch (error) {
        console.error("Profile load error:", error);
        alert("خطا در بارگذاری پروفایل مشتری.");
    }
}
