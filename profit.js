// profit.js
import { db, auth } from './firebase-config.js';
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.11.0/firebase-auth.js";
import { collection, getDocs, doc, updateDoc, query, where } from "https://www.gstatic.com/firebasejs/10.11.0/firebase-firestore.js";

// 🔴🔴🔴 ایمیل مدیریت
const ADMIN_EMAIL = "ramin.paradise800@gmail.com"; 

let allInvoicesRaw = []; // تمام فاکتورها برای محاسبه نرخ تبدیل
let filteredAllInvoices = []; 
let filteredFinalInvoices = []; // فقط فاکتورهای نهایی برای محاسبه سود و حجم
let currentCalcFilter = 'pending'; 

let exchangeRates = null;
const currencyCodes = { "€": "EUR", "£": "GBP", "$": "USD", "₺": "TRY" };

const tabBtns = document.querySelectorAll('.tab-btn');
const tabContents = document.querySelectorAll('.tab-content');
const dateRangeSelect = document.getElementById('date-range');
const customDatesDiv = document.getElementById('custom-dates');
const dateFrom = document.getElementById('date-from');
const dateTo = document.getElementById('date-to');
const applyDateBtn = document.getElementById('apply-date-btn');

onAuthStateChanged(auth, (user) => {
    if (user && user.email.toLowerCase() === ADMIN_EMAIL.toLowerCase()) {
        document.body.style.opacity = "1";
        initDashboard();
    } else {
        alert("دسترسی غیرمجاز!");
        window.location.href = "retail.html";
    }
});

async function initDashboard() {
    try {
        const response = await fetch(`https://open.er-api.com/v6/latest/EUR`);
        const data = await response.json();
        exchangeRates = data.rates;
        loadData();
    } catch (e) {
        console.error("خطا در دریافت نرخ ارز", e);
        loadData(); 
    }
}

function convertToEuro(amount, currencySymbol) {
    if (!amount) return 0;
    if (!exchangeRates) return amount; 
    
    const code = currencyCodes[currencySymbol] || "EUR";
    if (code === "EUR") return amount;
    
    const rate = exchangeRates[code];
    return amount / rate; 
}

tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
        tabBtns.forEach(b => b.classList.remove('active'));
        tabContents.forEach(c => c.classList.remove('active'));
        btn.classList.add('active');
        document.getElementById(btn.dataset.target).classList.add('active');
    });
});

document.getElementById('filter-pending').addEventListener('click', () => { currentCalcFilter = 'pending'; renderCalculator(); });
document.getElementById('filter-completed').addEventListener('click', () => { currentCalcFilter = 'completed'; renderCalculator(); });

async function loadData() {
    try {
        allInvoicesRaw = [];
        // دریافت تمام فاکتورها (چه اولیه و چه نهایی) برای محاسبه قدرت فروشندگان
        const retSnap = await getDocs(collection(db, "Retail_Invoices"));
        retSnap.forEach(doc => allInvoicesRaw.push({ id: doc.id, collectionName: "Retail_Invoices", ...doc.data() }));

        const whoSnap = await getDocs(collection(db, "Wholesale_Invoices"));
        whoSnap.forEach(doc => allInvoicesRaw.push({ id: doc.id, collectionName: "Wholesale_Invoices", ...doc.data() }));

        applyDateFilter(); 
    } catch (e) { console.error(e); alert("خطا در بارگذاری اطلاعات"); }
}

function applyDateFilter() {
    const range = dateRangeSelect.value;
    const now = new Date();
    let startDate = new Date(0); 
    let endDate = new Date();

    if (range === '30days') {
        startDate = new Date();
        startDate.setDate(now.getDate() - 30);
    } else if (range === 'thisMonth') {
        startDate = new Date(now.getFullYear(), now.getMonth(), 1);
    } else if (range === 'custom') {
        if (dateFrom.value) startDate = new Date(dateFrom.value);
        if (dateTo.value) {
            endDate = new Date(dateTo.value);
            endDate.setHours(23, 59, 59);
        }
    }

    filteredAllInvoices = allInvoicesRaw.filter(inv => {
        if (!inv.timestamp) return true;
        const invDate = inv.timestamp.toDate();
        return invDate >= startDate && invDate <= endDate;
    });

    // جداسازی فاکتورهای نهایی برای باکس‌های مالی
    filteredFinalInvoices = filteredAllInvoices.filter(inv => inv.status === 'نهایی');

    updateDashboard();
    renderCalculator();
    renderSellersStats();
}

dateRangeSelect.addEventListener('change', (e) => {
    if (e.target.value === 'custom') customDatesDiv.style.display = 'flex';
    else { customDatesDiv.style.display = 'none'; applyDateFilter(); }
});
applyDateBtn.addEventListener('click', applyDateFilter);

function updateDashboard() {
    let retVol = 0, whoVol = 0, retProf = 0, whoProf = 0;
    let countrySales = {};

    filteredFinalInvoices.forEach(inv => {
        if (!inv.isProfitCalculated) return;

        const grandTotalEUR = convertToEuro(inv.grandTotal, inv.currency);
        const netProfitEUR = convertToEuro(inv.netProfit || 0, inv.currency);

        if (inv.invoiceType === 'retail') {
            retVol += grandTotalEUR;
            retProf += netProfitEUR;
        } else {
            whoVol += grandTotalEUR;
            whoProf += netProfitEUR;
        }

        const country = inv.customerCountry || 'نامشخص';
        if (!countrySales[country]) countrySales[country] = 0;
        countrySales[country] += grandTotalEUR;
    });

    document.getElementById('dash-retail-vol').textContent = `${retVol.toFixed(2)} €`;
    document.getElementById('dash-wholesale-vol').textContent = `${whoVol.toFixed(2)} €`;
    document.getElementById('dash-retail-profit').textContent = `${retProf.toFixed(2)} €`;
    document.getElementById('dash-wholesale-profit').textContent = `${whoProf.toFixed(2)} €`;

    const sortedCountries = Object.entries(countrySales).sort((a, b) => b[1] - a[1]);
    const tcDiv = document.getElementById('top-countries');
    tcDiv.innerHTML = '';
    sortedCountries.forEach(([country, amount], index) => {
        tcDiv.innerHTML += `<div style="display:flex; justify-content:space-between; padding:8px; border-bottom:1px solid #eee;">
            <span>${index + 1}. <strong>${country}</strong></span>
            <span style="color:#2980b9; font-weight:bold;">~ ${amount.toFixed(2)} €</span>
        </div>`;
    });
}

function renderSellersStats() {
    let sellerData = {};
    
    filteredAllInvoices.forEach(inv => {
        const seller = inv.salespersonName || 'نامشخص';
        if (!sellerData[seller]) {
            sellerData[seller] = { totalInvs: 0, finalInvs: 0, retVol: 0, whoVol: 0, retProf: 0, whoProf: 0 };
        }
        
        sellerData[seller].totalInvs++;

        if (inv.status === 'نهایی') {
            sellerData[seller].finalInvs++;
            const grandTotalEUR = convertToEuro(inv.grandTotal, inv.currency);
            const netProfitEUR = convertToEuro(inv.netProfit || 0, inv.currency);

            if (inv.invoiceType === 'retail') {
                sellerData[seller].retVol += grandTotalEUR;
                if (inv.isProfitCalculated) sellerData[seller].retProf += netProfitEUR;
            } else {
                sellerData[seller].whoVol += grandTotalEUR;
                if (inv.isProfitCalculated) sellerData[seller].whoProf += netProfitEUR;
            }
        }
    });

    // مرتب‌سازی فروشندگان بر اساس بیشترین فروش نهایی (تک + عمده)
    const sortedSellers = Object.entries(sellerData).sort((a, b) => {
        const totalVolA = a[1].retVol + a[1].whoVol;
        const totalVolB = b[1].retVol + b[1].whoVol;
        return totalVolB - totalVolA;
    });

    const tbody = document.getElementById('sellers-stats-body');
    tbody.innerHTML = '';
    
    let chartLabels = [];
    let retChartData = [];
    let whoChartData = [];

    sortedSellers.forEach(([name, stats]) => {
        const totalVol = stats.retVol + stats.whoVol;
        const conversionRate = stats.totalInvs > 0 ? ((stats.finalInvs / stats.totalInvs) * 100).toFixed(1) : 0;
        
        if (totalVol > 0) {
            chartLabels.push(name);
            retChartData.push(stats.retVol);
            whoChartData.push(stats.whoVol);
        }

        tbody.innerHTML += `<tr>
            <td style="font-weight:bold; color:#2c3e50; font-size:15px;">
                ${name}<br>
                <span style="font-size:11px; color:#7f8c8d; font-weight:normal;">مجموع فروش: ${totalVol.toFixed(2)} €</span>
            </td>
            <td style="text-align:center;">
                <span style="display:block; font-weight:bold; color:#34495e;">${stats.totalInvs} پیش‌فاکتور</span>
                <span style="display:block; color:#27ae60; font-size:12px; margin-bottom:6px;">${stats.finalInvs} نهایی</span>
                <span style="background:${conversionRate >= 50 ? '#d5f5e3' : '#fdedec'}; color:${conversionRate >= 50 ? '#27ae60' : '#e74c3c'}; padding:3px 8px; border-radius:4px; font-size:12px; font-weight:bold;">نرخ تبدیل: ${conversionRate}%</span>
            </td>
            <td style="font-size:13px; line-height:1.8;">
                تک: <span style="color:#2980b9; font-weight:bold;">${stats.retVol.toFixed(2)} €</span><br>
                عمده: <span style="color:#8e44ad; font-weight:bold;">${stats.whoVol.toFixed(2)} €</span>
            </td>
            <td style="font-size:13px; line-height:1.8;">
                تک: <span style="color:#27ae60; font-weight:bold;">${stats.retProf.toFixed(2)} €</span><br>
                عمده: <span style="color:#27ae60; font-weight:bold;">${stats.whoProf.toFixed(2)} €</span>
            </td>
        </tr>`;
    });

    // فراخوانی تابع تزریق نمودارها
    drawCharts(chartLabels, retChartData, whoChartData);
}

// ----------------------------------------------------
// موتور هوشمند رسم نمودار و استایل‌دهی جدول (بدون نیاز به HTML)
// ----------------------------------------------------
let retailChartInstance = null;
let wholesaleChartInstance = null;

function drawCharts(labels, retData, whoData) {
    const table = document.getElementById('sellers-stats-body').closest('table');
    let chartsContainer = document.getElementById('sellers-charts-container');
    
    // اگر کانتینر نمودارها وجود نداشت، آن را دقیقاً بالای جدول خلق می‌کنیم
    if (!chartsContainer) {
        chartsContainer = document.createElement('div');
        chartsContainer.id = 'sellers-charts-container';
        chartsContainer.style.display = 'flex';
        chartsContainer.style.flexWrap = 'wrap';
        chartsContainer.style.gap = '20px';
        chartsContainer.style.marginBottom = '25px';
        chartsContainer.style.justifyContent = 'center';
        chartsContainer.innerHTML = `
            <div style="flex:1; min-width:280px; max-width:400px; background:#fff; padding:20px; border:1px solid #eee; border-radius:12px; box-shadow: 0 4px 10px rgba(0,0,0,0.05); text-align:center;">
                <h4 style="color:#2980b9; margin-bottom:15px; font-size:15px; font-weight:bold;">📊 سهم فروش تک‌فروشی</h4>
                <canvas id="retail-pie-chart"></canvas>
            </div>
            <div style="flex:1; min-width:280px; max-width:400px; background:#fff; padding:20px; border:1px solid #eee; border-radius:12px; box-shadow: 0 4px 10px rgba(0,0,0,0.05); text-align:center;">
                <h4 style="color:#8e44ad; margin-bottom:15px; font-size:15px; font-weight:bold;">📊 سهم فروش عمده‌فروشی</h4>
                <canvas id="wholesale-pie-chart"></canvas>
            </div>
        `;
        table.parentNode.insertBefore(chartsContainer, table);
        
        // تغییر مدرن سرستون‌های جدول (با تزریق CSS)
        const thead = table.querySelector('thead tr');
        if(thead) {
            thead.innerHTML = `
                <th style="width:25%; background:#2c3e50; color:white; padding:12px; text-align:center; border-radius: 0 8px 0 0;">نام فروشنده</th>
                <th style="width:25%; background:#2c3e50; color:white; padding:12px; text-align:center;">عملکرد و نرخ تبدیل</th>
                <th style="width:25%; background:#2c3e50; color:white; padding:12px; text-align:center;">حجم فروش (یورو)</th>
                <th style="width:25%; background:#2c3e50; color:white; padding:12px; text-align:center; border-radius: 8px 0 0 0;">سودآوری خالص</th>
            `;
        }
    }

    // دانلود کتابخانه Chart.js به صورت هوشمند
    if (typeof Chart === 'undefined') {
        const script = document.createElement('script');
        script.src = "https://cdn.jsdelivr.net/npm/chart.js";
        script.onload = () => renderPieCharts(labels, retData, whoData);
        document.head.appendChild(script);
    } else {
        renderPieCharts(labels, retData, whoData);
    }
}

function renderPieCharts(labels, retData, whoData) {
    const retCtx = document.getElementById('retail-pie-chart').getContext('2d');
    const whoCtx = document.getElementById('wholesale-pie-chart').getContext('2d');
    const colors = ['#3498db', '#e74c3c', '#2ecc71', '#f1c40f', '#9b59b6', '#e67e22', '#1abc9c', '#34495e', '#d35400', '#7f8c8d'];

    // نمودار لوکس تک‌فروشی
    if (retailChartInstance) retailChartInstance.destroy();
    retailChartInstance = new Chart(retCtx, {
        type: 'doughnut',
        data: { labels: labels, datasets: [{ data: retData, backgroundColor: colors.slice(0, labels.length), borderWidth: 2 }] },
        options: { responsive: true, plugins: { legend: { position: 'bottom', labels: { font: { family: 'Tahoma' } } } }, cutout: '65%' }
    });

    // نمودار لوکس عمده‌فروشی
    if (wholesaleChartInstance) wholesaleChartInstance.destroy();
    wholesaleChartInstance = new Chart(whoCtx, {
        type: 'doughnut',
        data: { labels: labels, datasets: [{ data: whoData, backgroundColor: colors.slice(0, labels.length), borderWidth: 2 }] },
        options: { responsive: true, plugins: { legend: { position: 'bottom', labels: { font: { family: 'Tahoma' } } } }, cutout: '65%' }
    });
}
// ----------------------------------------------------

function renderCalculator() {
    const calcList = document.getElementById('calculator-list');
    calcList.innerHTML = '';

    const listToShow = filteredFinalInvoices.filter(inv => {
        const isCalculated = inv.isProfitCalculated === true;
        return currentCalcFilter === 'pending' ? !isCalculated : isCalculated;
    });

    if (listToShow.length === 0) {
        calcList.innerHTML = `<p style="text-align:center; padding:20px; color:#7f8c8d;">هیچ فاکتوری در این بخش یافت نشد.</p>`;
        return;
    }

    listToShow.forEach(inv => {
        const div = document.createElement('div');
        div.className = 'inv-card';
        const dateStr = inv.timestamp
