// profit.js
import { db, auth } from './firebase-config.js';
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.11.0/firebase-auth.js";
import { collection, getDocs, doc, updateDoc, query, where } from "https://www.gstatic.com/firebasejs/10.11.0/firebase-firestore.js";

// 🔴🔴🔴 ایمیل مدیریت
const ADMIN_EMAIL = "ramin.paradise800@gmail.com"; 

let allInvoicesRaw = []; 
let filteredAllInvoices = []; 
let filteredFinalInvoices = []; 
let currentCalcFilter = 'pending'; 
let currentTrendView = 'monthly'; 

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
    
    // تفکیک کشورهای خریدار برای درصدگیری
    let countrySalesRetail = {};
    let countrySalesWholesale = {};

    filteredFinalInvoices.forEach(inv => {
        if (!inv.isProfitCalculated) return;

        const grandTotalEUR = convertToEuro(inv.grandTotal, inv.currency);
        const netProfitEUR = convertToEuro(inv.netProfit || 0, inv.currency);
        const country = inv.customerCountry || 'نامشخص';

        if (inv.invoiceType === 'retail') {
            retVol += grandTotalEUR;
            retProf += netProfitEUR;
            countrySalesRetail[country] = (countrySalesRetail[country] || 0) + grandTotalEUR;
        } else {
            whoVol += grandTotalEUR;
            whoProf += netProfitEUR;
            countrySalesWholesale[country] = (countrySalesWholesale[country] || 0) + grandTotalEUR;
        }
    });

    // آپدیت ۴ کارت قدیمی
    document.getElementById('dash-retail-vol').textContent = `${retVol.toFixed(2)} €`;
    document.getElementById('dash-wholesale-vol').textContent = `${whoVol.toFixed(2)} €`;
    document.getElementById('dash-retail-profit').textContent = `${retProf.toFixed(2)} €`;
    document.getElementById('dash-wholesale-profit').textContent = `${whoProf.toFixed(2)} €`;

    // پاک‌سازی کارت تکی قدیمی در صورت وجود (از آپدیت قبلی)
    const oldTotalProfitCard = document.getElementById('dash-total-net-profit');
    if (oldTotalProfitCard && oldTotalProfitCard.closest('.summary-card')) {
        oldTotalProfitCard.closest('.summary-card').remove();
    }

    // تزریق پویای ردیف جدید: "مجموع کل حجم فروش" و "مجموع کل سود خالص"
    let totalCardsContainer = document.getElementById('dynamic-total-cards');
    if (!totalCardsContainer) {
        const wholesaleProfitCard = document.getElementById('dash-wholesale-profit').closest('.summary-card');
        if (wholesaleProfitCard && wholesaleProfitCard.parentNode) {
            const summaryContainer = wholesaleProfitCard.parentNode;
            totalCardsContainer = document.createElement('div');
            totalCardsContainer.id = 'dynamic-total-cards';
            totalCardsContainer.style.cssText = 'display:flex; gap:15px; width:100%; margin-top:20px; flex-wrap:wrap;';
            summaryContainer.appendChild(totalCardsContainer);
        }
    }
    
    if (totalCardsContainer) {
        totalCardsContainer.innerHTML = `
            <div class="summary-card" style="flex:1; min-width:250px; background: linear-gradient(135deg, #2980b9, #6dd5ed); color: white; border: none; box-shadow: 0 4px 15px rgba(41, 128, 185, 0.2); padding:20px; border-radius:8px; text-align:center;">
                <h4 style="color: rgba(255,255,255,0.9); font-size: 14px; margin-bottom: 10px; font-weight: bold;">📊 مجموع کل حجم فروش (تک + عمده)</h4>
                <span style="font-size: 26px; font-weight: bold;">${(retVol + whoVol).toFixed(2)} €</span>
            </div>
            <div class="summary-card" style="flex:1; min-width:250px; background: linear-gradient(135deg, #11998e, #38ef7d); color: white; border: none; box-shadow: 0 4px 15px rgba(46, 204, 113, 0.2); padding:20px; border-radius:8px; text-align:center;">
                <h4 style="color: rgba(255,255,255,0.9); font-size: 14px; margin-bottom: 10px; font-weight: bold;">💰 مجموع کل سود خالص (تک + عمده)</h4>
                <span style="font-size: 26px; font-weight: bold;">${(retProf + whoProf).toFixed(2)} €</span>
            </div>
        `;
    }

    // طراحی و تزریق لیست کشورهای تفکیک شده با پراگرس بار (درصد)
    const tcDiv = document.getElementById('top-countries');
    if (tcDiv) {
        tcDiv.style.display = 'flex';
        tcDiv.style.gap = '20px';
        tcDiv.style.flexWrap = 'wrap';
        tcDiv.style.padding = '0'; // ریست کردن پدینگ‌های قدیمی
        
        const buildCountryList = (title, dataObj, totalVol, color) => {
            let html = `<div style="flex:1; min-width:280px; background:#fff; padding:20px; border-radius:12px; border:1px solid #eee; box-shadow:0 4px 10px rgba(0,0,0,0.03);">
                <h4 style="color:${color}; margin-top:0; margin-bottom:20px; font-weight:bold; font-size:15px;">${title}</h4>`;
            
            const sorted = Object.entries(dataObj).sort((a,b) => b[1] - a[1]);
            
            if(sorted.length === 0) {
                html += `<p style="font-size:13px; color:#777; text-align:center;">هیچ فروشی در این بازه ثبت نشده است.</p>`;
            }
            
            sorted.forEach(([cName, cVol], idx) => {
                const perc = totalVol > 0 ? ((cVol / totalVol) * 100).toFixed(1) : 0;
                html += `<div style="margin-bottom:15px;">
                    <div style="display:flex; justify-content:space-between; font-size:14px; margin-bottom:6px;">
                        <span>${idx + 1}. <strong>${cName}</strong></span>
                        <span style="color:${color}; font-weight:bold;">${perc}% <span style="font-size:11px; color:#7f8c8d; font-weight:normal;">(${cVol.toFixed(2)} €)</span></span>
                    </div>
                    <div style="width:100%; background:#f1f2f6; height:8px; border-radius:4px; overflow:hidden;">
                        <div style="width:${perc}%; background:${color}; height:100%; border-radius:4px; transition: width 0.5s ease;"></div>
                    </div>
                </div>`;
            });
            html += `</div>`;
            return html;
        };

        tcDiv.innerHTML = buildCountryList('🛍️ سهم کشورها در تک‌فروشی', countrySalesRetail, retVol, '#2980b9') + 
                          buildCountryList('📦 سهم کشورها در عمده‌فروشی', countrySalesWholesale, whoVol, '#8e44ad');
    }

    drawTrendChart();
}

// ----------------------------------------------------
// نمودار روند زمانی (گوگل ادز) - مخصوص داشبورد کلان
// ----------------------------------------------------
let trendChartInstance = null;

function drawTrendChart() {
    const topCountriesEl = document.getElementById('top-countries');
    if (!topCountriesEl) return;
    
    const dashboardTab = topCountriesEl.closest('.tab-content') || topCountriesEl.parentElement.parentElement;
    
    let trendContainer = document.getElementById('historical-trend-container');
    if (!trendContainer) {
        trendContainer = document.createElement('div');
        trendContainer.id = 'historical-trend-container';
        trendContainer.style.cssText = 'width: 100%; background: #fff; padding: 25px; border: 1px solid #eee; border-radius: 12px; box-shadow: 0 4px 15px rgba(0,0,0,0.05); margin-top: 30px; text-align: center;';
        trendContainer.innerHTML = `
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; flex-wrap: wrap; gap: 10px; direction: rtl;">
                <h4 style="color: #2c3e50; font-size: 16px; font-weight: bold; margin: 0;">📈 بنچمارک تحلیل روند کلان فروش و سود خالص (Google Ads Style)</h4>
                <div style="display: flex; gap: 8px; align-items: center;">
                    <button id="trend-monthly-btn" class="btn btn-small btn-blue" style="padding: 6px 14px; font-size: 12px;"> نمای ماهانه</button>
                    <button id="trend-yearly-btn" class="btn btn-small btn-gray" style="padding: 6px 14px; font-size: 12px; background-color: #7f8c8d;"> نمای سالانه</button>
                </div>
            </div>
            <div style="position: relative; height: 340px; width: 100%;">
                <canvas id="trend-linear-chart"></canvas>
            </div>
        `;
        dashboardTab.appendChild(trendContainer);

        document.getElementById('trend-monthly-btn').addEventListener('click', () => {
            currentTrendView = 'monthly';
            document.getElementById('trend-monthly-btn').className = "btn btn-small btn-blue";
            document.getElementById('trend-yearly-btn').className = "btn btn-small btn-gray";
            document.getElementById('trend-yearly-btn').style.backgroundColor = "#7f8c8d";
            drawTrendChart(); 
        });

        document.getElementById('trend-yearly-btn').addEventListener('click', () => {
            currentTrendView = 'yearly';
            document.getElementById('trend-yearly-btn').className = "btn btn-small btn-blue";
            document.getElementById('trend-monthly-btn').className = "btn btn-small btn-gray";
            document.getElementById('trend-monthly-btn').style.backgroundColor = "#7f8c8d";
            drawTrendChart(); 
        });
    }

    let trendGroups = {};
    allInvoicesRaw.forEach(inv => {
        if (inv.status !== 'نهایی') return;
        let dateObj = inv.timestamp ? inv.timestamp.toDate() : null;
        if (!dateObj) return;

        let key = "";
        if (currentTrendView === 'monthly') {
            let month = String(dateObj.getMonth() + 1).padStart(2, '0');
            key = `${dateObj.getFullYear()} / ${month}`;
        } else {
            key = `${dateObj.getFullYear()}`;
        }

        if (!trendGroups[key]) trendGroups[key] = { sales: 0, profit: 0 };
        trendGroups[key].sales += convertToEuro(inv.grandTotal, inv.currency);
        if (inv.isProfitCalculated && inv.netProfit !== undefined) {
            trendGroups[key].profit += convertToEuro(inv.netProfit, inv.currency);
        }
    });

    let sortedTimelineKeys = Object.keys(trendGroups).sort();
    let salesTimelineData = [];
    let profitTimelineData = [];

    sortedTimelineKeys.forEach(k => {
        salesTimelineData.push(trendGroups[k].sales.toFixed(2));
        profitTimelineData.push(trendGroups[k].profit.toFixed(2));
    });

    if (typeof Chart === 'undefined') {
        const script = document.createElement('script');
        script.src = "https://cdn.jsdelivr.net/npm/chart.js";
        script.onload = () => renderTrendChartCanvas(sortedTimelineKeys, salesTimelineData, profitTimelineData);
        document.head.appendChild(script);
    } else {
        renderTrendChartCanvas(sortedTimelineKeys, salesTimelineData, profitTimelineData);
    }
}

function renderTrendChartCanvas(labels, salesData, profitData) {
    const trendCtx = document.getElementById('trend-linear-chart').getContext('2d');
    if (trendChartInstance) trendChartInstance.destroy();

    trendChartInstance = new Chart(trendCtx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [
                {
                    label: '🔵 مجموع حجم کل فروش (€)',
                    data: salesData,
                    backgroundColor: 'rgba(52, 152, 219, 0.7)',
                    borderColor: '#3498db',
                    borderWidth: 2,
                    borderRadius: 5,
                    yAxisID: 'y'
                },
                {
                    label: '🟢 مجموع کل سود خالص (€)',
                    data: profitData,
                    backgroundColor: 'transparent',
                    borderColor: '#2ecc71',
                    borderWidth: 4,
                    pointBackgroundColor: '#27ae60',
                    pointRadius: 6,
                    pointHoverRadius: 8,
                    type: 'line',
                    tension: 0.3,
                    yAxisID: 'y1'
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                x: { grid: { display: false }, ticks: { font: { family: 'Tahoma', size: 11 } } },
                y: {
                    type: 'linear',
                    display: true,
                    position: 'right',
                    title: { display: true, text: 'حجم کل فروش (€)', font: { family: 'Tahoma', weight: 'bold' } },
                    ticks: { font: { family: 'Tahoma' } }
                },
                y1: {
                    type: 'linear',
                    display: true,
                    position: 'left',
                    grid: { drawOnChartArea: false },
                    title: { display: true, text: 'سود خالص واقعی (€)', font: { family: 'Tahoma', weight: 'bold' } },
                    ticks: { font: { family: 'Tahoma' } }
                }
            },
            plugins: {
                legend: { position: 'top', labels: { font: { family: 'Tahoma', weight: 'bold', size: 12 }, padding: 15 } },
                tooltip: { bodyFont: { family: 'Tahoma' }, titleFont: { family: 'Tahoma' } }
            }
        }
    });
}

// ----------------------------------------------------
// نمودارهای دایره‌ای و جدول آمار فروشندگان
// ----------------------------------------------------
let retailPieInstance = null;
let wholesalePieInstance = null;

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

    drawSellersPieCharts(chartLabels, retChartData, whoChartData);
}

function drawSellersPieCharts(labels, retData, whoData) {
    const table = document.getElementById('sellers-stats-body').closest('table');
    let chartsContainer = document.getElementById('sellers-pie-charts-container');
    
    if (!chartsContainer) {
        chartsContainer = document.createElement('div');
        chartsContainer.id = 'sellers-pie-charts-container';
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

    if (typeof Chart === 'undefined') {
        const script = document.createElement('script');
        script.src = "https://cdn.jsdelivr.net/npm/chart.js";
        script.onload = () => executePieCharts(labels, retData, whoData);
        document.head.appendChild(script);
    } else {
        executePieCharts(labels, retData, whoData);
    }
}

function executePieCharts(labels, retData, whoData) {
    const retCtx = document.getElementById('retail-pie-chart').getContext('2d');
    const whoCtx = document.getElementById('wholesale-pie-chart').getContext('2d');
    const colors = ['#3498db', '#e74c3c', '#2ecc71', '#f1c40f', '#9b59b6', '#e67e22', '#1abc9c', '#34495e', '#d35400', '#7f8c8d'];

    if (retailPieInstance) retailPieInstance.destroy();
    retailPieInstance = new Chart(retCtx, {
        type: 'doughnut',
        data: { labels: labels, datasets: [{ data: retData, backgroundColor: colors.slice(0, labels.length), borderWidth: 2 }] },
        options: { responsive: true, plugins: { legend: { position: 'bottom', labels: { font: { family: 'Tahoma' } } } }, cutout: '65%' }
    });

    if (wholesalePieInstance) wholesalePieInstance.destroy();
    wholesalePieInstance = new Chart(whoCtx, {
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
        const dateStr = inv.timestamp ? new Date(inv.timestamp.toDate()).toLocaleDateString('en-GB') : '-';
        const shippingCharged = parseFloat(inv.shippingCost) || 0;
        const discount = parseFloat(inv.discount) || 0;
        const sellerName = inv.salespersonName || 'نامشخص'; 
        
        let itemsHTML = '';
        (inv.items || []).forEach((item, idx) => {
            const cost = item.costPrice || 0;
            itemsHTML += `<tr>
                <td style="text-align:left;">${item.name}</td>
                <td>${item.qty}</td>
                <td>${item.price} ${inv.currency}</td>
                <td><input type="number" class="item-cost-input" data-idx="${idx}" value="${cost}" step="0.01" placeholder="خرید تکی"> ${inv.currency}</td>
            </tr>`;
        });

        div.innerHTML = `
            <div class="inv-header">
                <div>
                    <span style="font-size:18px; font-weight:bold;">${inv.invoiceNumber}</span>
                    <span style="margin-right:15px; font-size:12px; background:#f1c40f; color:#000; padding:3px 8px; border-radius:4px;">${inv.invoiceType === 'retail' ? 'تک فروشی' : 'عمده فروشی'}</span>
                </div>
                <div style="font-size:14px;">
                    مشتری: ${inv.customerName} | 
                    <span style="color: #a29bfe; font-weight: bold; margin: 0 5px;">👤 فروشنده: ${sellerName}</span> | 
                    مبلغ کل فاکتور: <span style="color:#f1c40f; font-weight:bold;">${inv.grandTotal} ${inv.currency}</span>
                </div>
            </div>
            <div class="inv-body">
                <table class="items-table">
                    <thead style="background:#ecf0f1;"><tr><th style="text-align:left;">محصول</th><th>تعداد</th><th>فروش (تکی)</th><th>خرید (تکی)</th></tr></thead>
                    <tbody>${itemsHTML}</tbody>
                </table>
                <div style="background:#fff; padding:15px; border:1px solid #ddd; border-radius:4px;">
                    
                    <div style="display:flex; justify-content:space-between; flex-wrap: wrap; gap: 15px; margin-bottom: 15px; border-bottom: 1px dashed #ccc; padding-bottom: 15px;">
                        <div style="flex:1;">
                            <div style="margin-bottom: 8px; font-size: 14px; color: #2980b9; font-weight: bold;">
                                📦 دریافتی از مشتری بابت ارسال در فاکتور: ${shippingCharged} ${inv.currency}
                            </div>
                            <label style="font-weight:bold; color: #2c3e50;">🚚 پرداختی واقعی شما بابت ارسال/کارگو:</label>
                            <br>
                            <input type="number" id="actual-ship-${inv.id}" class="live-calc-input" value="${inv.actualShippingCost || 0}" step="0.01" style="width:120px; padding:8px; margin-top:5px; border: 1px solid #ccc; border-radius: 4px;"> ${inv.currency}
                        </div>
                        <div style="flex:1; background: #f8f9fa; padding: 15px; border-radius: 6px; text-align: right; font-size: 14px;">
                            <p style="margin-bottom:5px;">🛒 سود کالاها: <span id="items-profit-${inv.id}" style="font-weight:bold;">0.00</span> ${inv.currency}</p>
                            <p style="margin-bottom:5px;">📦 سود/زیان ارسال: <span id="shipping-profit-${inv.id}" style="font-weight:bold;">0.00</span> ${inv.currency}</p>
                            <p style="color:#e74c3c; margin-bottom:0;">📉 تخفیف فاکتور: ${discount} ${inv.currency}</p>
                        </div>
                    </div>

                    <div style="display:flex; justify-content:space-between; align-items:center;">
                        <span style="font-weight:bold; font-size:18px;">سود خالص نهایی: <span id="profit-display-${inv.id}">${inv.netProfit ? inv.netProfit.toFixed(2) : '0.00'}</span> ${inv.currency}</span>
                        <button class="btn-success save-profit-btn" data-id="${inv.id}" data-col="${inv.collectionName}" style="padding:10px 20px; border:none; border-radius:4px; cursor:pointer;">💾 تایید و ذخیره سود</button>
                    </div>
                </div>
            </div>
        `;
        calcList.appendChild(div);

        const updateLiveCalc = () => {
            let totalSalesGoods = 0;
            let totalCostGoods = 0;
            
            div.querySelectorAll('.item-cost-input').forEach((input, idx) => {
                const cost = parseFloat(input.value) || 0;
                const qty = parseFloat(inv.items[idx].qty) || 0;
                const price = parseFloat(inv.items[idx].price) || 0;
                totalSalesGoods += (price * qty);
                totalCostGoods += (cost * qty);
            });
            
            const actualShip = parseFloat(document.getElementById(`actual-ship-${inv.id}`).value) || 0;
            
            const itemsProfit = totalSalesGoods - totalCostGoods;
            const shippingProfit = shippingCharged - actualShip;
            const netProfit = itemsProfit + shippingProfit - discount; 

            document.getElementById(`items-profit-${inv.id}`).textContent = itemsProfit.toFixed(2);
            
            const shipProfEl = document.getElementById(`shipping-profit-${inv.id}`);
            shipProfEl.textContent = shippingProfit.toFixed(2);
            shipProfEl.style.color = shippingProfit < 0 ? '#e74c3c' : '#27ae60'; 
            
            const netProfEl = document.getElementById(`profit-display-${inv.id}`);
            netProfEl.textContent = netProfit.toFixed(2);
            netProfEl.style.color = netProfit < 0 ? '#e74c3c' : '#27ae60';
        };

        div.querySelectorAll('.item-cost-input, .live-calc-input').forEach(inp => {
            inp.addEventListener('input', updateLiveCalc);
        });
        
        updateLiveCalc(); 

        const saveBtn = div.querySelector('.save-profit-btn');
        saveBtn.addEventListener('click', async () => {
            saveBtn.textContent = "⏳...";
            saveBtn.disabled = true;

            const updatedItems = [...inv.items];
            let totalCostOfGoods = 0;
            
            div.querySelectorAll('.item-cost-input').forEach(input => {
                const idx = input.dataset.idx;
                const cost = parseFloat(input.value) || 0;
                updatedItems[idx].costPrice = cost;
                totalCostOfGoods += (cost * updatedItems[idx].qty); 
            });

            const actualShip = parseFloat(document.getElementById(`actual-ship-${inv.id}`).value) || 0;
            const netProfit = inv.grandTotal - (totalCostOfGoods + actualShip);

            try {
                await updateDoc(doc(db, inv.collectionName, inv.id), {
                    items: updatedItems,
                    actualShippingCost: actualShip,
                    costOfGoods: totalCostOfGoods,
                    netProfit: netProfit,
                    isProfitCalculated: true
                });

                saveBtn.textContent = "✔️ ذخیره شد";
                
                const invIndexRaw = allInvoicesRaw.findIndex(i => i.id === inv.id);
                if (invIndexRaw > -1) {
                    allInvoicesRaw[invIndexRaw].items = updatedItems;
                    allInvoicesRaw[invIndexRaw].actualShippingCost = actualShip;
                    allInvoicesRaw[invIndexRaw].netProfit = netProfit;
                    allInvoicesRaw[invIndexRaw].isProfitCalculated = true;
                }
                
                applyDateFilter(); 

                setTimeout(() => {
                    if (currentCalcFilter === 'pending') {
                        div.style.display = 'none';
                    } else {
                        saveBtn.textContent = "💾 تایید و ذخیره سود";
                        saveBtn.disabled = false;
                    }
                }, 1000);

            } catch (e) {
                alert("خطا در ذخیره اطلاعات.");
                saveBtn.disabled = false;
                saveBtn.textContent = "💾 تایید و ذخیره سود";
            }
        });
    });
}
