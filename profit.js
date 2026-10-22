// profit.js
import { db, auth } from './firebase-config.js';
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.11.0/firebase-auth.js";
import { collection, getDocs, doc, updateDoc, query, where, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.11.0/firebase-firestore.js";

// 🔴🔴🔴 ایمیل مدیریت
const ADMIN_EMAIL = "ramin.paradise800@gmail.com"; 

let allInvoicesRaw = []; 
let filteredAllInvoices = []; 
let filteredFinalInvoices = []; 
let currentCalcFilter = 'pending'; // 'pending' | 'completed' | 'initial'
let calcSearchQuery = '';
let currentTrendView = 'monthly'; 
// ذخیره وضعیت انتخابگرهای داشبورد کلان برای جلوگیری از ریست شدن هنگام تغییر تاریخ
let currentCountryFilter = 'total';
let currentSourceFilter = 'total';

let exchangeRates = null;
const currencyCodes = { "€": "EUR", "£": "GBP", "$": "USD", "₺": "TRY" };

const statusLabels = ["ثبت اولیه", "نهایی", "کنسل شده"];
const baseLeadSources = ["اینستاگرام", "گوگل", "تلگرام", "تیک‌تاک", "یوتیوب", "قدیمی", "معرفی"];

const tabBtns = document.querySelectorAll('.tab-btn');
const tabContents = document.querySelectorAll('.tab-content');
const dateRangeSelect = document.getElementById('date-range');
const customDatesDiv = document.getElementById('custom-dates');
const dateFrom = document.getElementById('date-from');
const dateTo = document.getElementById('date-to');
const applyDateBtn = document.getElementById('apply-date-btn');

// 🔥 تابع هوشمند تشخیص تاریخ موثر فاکتور (تاریخ نهایی شدن برای جدیدها، تاریخ صدور برای قدیمی‌ها) 🔥
function getEffectiveDate(inv) {
    if (inv.status === 'نهایی' && inv.finalizedAt) {
        if (typeof inv.finalizedAt.toDate === 'function') return inv.finalizedAt.toDate();
        if (inv.finalizedAt instanceof Date) return inv.finalizedAt;
        if (typeof inv.finalizedAt.toMillis === 'function') return new Date(inv.finalizedAt.toMillis());
    }
    if (inv.timestamp) {
        if (typeof inv.timestamp.toDate === 'function') return inv.timestamp.toDate();
        if (inv.timestamp instanceof Date) return inv.timestamp;
        if (typeof inv.timestamp.toMillis === 'function') return new Date(inv.timestamp.toMillis());
    }
    return null;
}

function getEffectiveMillis(inv) {
    const d = getEffectiveDate(inv);
    return d ? d.getTime() : 0;
}

onAuthStateChanged(auth, (user) => {
    if (user && user.email.toLowerCase() === ADMIN_EMAIL.toLowerCase()) {
        document.body.style.opacity = "1";
        setupCalculatorToolbar();
        initDashboard();
    } else {
        alert("دسترسی غیرمجاز!");
        window.location.href = "retail.html";
    }
});

// ساخت خودکار گزینه «ماه گذشته»، کادر جستجو و دکمه پیش‌فاکتورها
function setupCalculatorToolbar() {
    // افزودن خودکار گزینه «ماه گذشته» به منوی فیلتر تاریخ در صورت عدم وجود
    if (dateRangeSelect && !dateRangeSelect.querySelector('option[value="lastMonth"]')) {
        const lastMonthOpt = document.createElement('option');
        lastMonthOpt.value = 'lastMonth';
        lastMonthOpt.textContent = 'ماه گذشته';
        const thisMonthOpt = dateRangeSelect.querySelector('option[value="thisMonth"]');
        if (thisMonthOpt && thisMonthOpt.nextSibling) {
            dateRangeSelect.insertBefore(lastMonthOpt, thisMonthOpt.nextSibling);
        } else {
            dateRangeSelect.appendChild(lastMonthOpt);
        }
    }

    const pendingBtn = document.getElementById('filter-pending');
    const completedBtn = document.getElementById('filter-completed');
    const calcList = document.getElementById('calculator-list');

    if (pendingBtn && completedBtn && !document.getElementById('filter-initial')) {
        const initialBtn = document.createElement('button');
        initialBtn.id = 'filter-initial';
        initialBtn.className = completedBtn.className;
        initialBtn.textContent = '📝 پیش‌فاکتورها (ثبت اولیه)';
        initialBtn.style.marginRight = '8px';
        completedBtn.parentNode.appendChild(initialBtn);

        initialBtn.addEventListener('click', () => {
            currentCalcFilter = 'initial';
            updateCalcFilterButtons();
            renderCalculator();
        });
    }

    if (calcList && !document.getElementById('calc-search-box')) {
        const searchWrapper = document.createElement('div');
        searchWrapper.style.cssText = 'margin: 15px 0; display: flex; gap: 10px; align-items: center; background: #fff; padding: 12px 15px; border-radius: 8px; border: 1px solid #dcdde1; box-shadow: 0 2px 6px rgba(0,0,0,0.04);';
        searchWrapper.innerHTML = `
            <span style="font-size: 18px;">🔍</span>
            <input type="text" id="calc-search-box" placeholder="جستجوی شماره فاکتور (مثلاً INV-123456)، نام مشتری یا شماره تماس در کل فاکتورها..." style="flex: 1; border: none; outline: none; font-size: 14px; font-family: inherit;">
            <button id="calc-search-clear" style="display: none; background: #e74c3c; color: #fff; border: none; padding: 4px 10px; border-radius: 4px; cursor: pointer; font-size: 12px;">پاک کردن ✖</button>
        `;
        calcList.parentNode.insertBefore(searchWrapper, calcList);

        const searchInput = document.getElementById('calc-search-box');
        const clearBtn = document.getElementById('calc-search-clear');

        searchInput.addEventListener('input', (e) => {
            calcSearchQuery = e.target.value.trim().toLowerCase();
            clearBtn.style.display = calcSearchQuery ? 'inline-block' : 'none';
            renderCalculator();
        });

        clearBtn.addEventListener('click', () => {
            searchInput.value = '';
            calcSearchQuery = '';
            clearBtn.style.display = 'none';
            renderCalculator();
        });
    }

    updateCalcFilterButtons();
}

function updateCalcFilterButtons() {
    const btnMap = {
        'pending': document.getElementById('filter-pending'),
        'completed': document.getElementById('filter-completed'),
        'initial': document.getElementById('filter-initial')
    };
    Object.entries(btnMap).forEach(([key, btn]) => {
        if (!btn) return;
        if (key === currentCalcFilter) {
            btn.style.backgroundColor = '#2980b9';
            btn.style.color = '#fff';
            btn.style.fontWeight = 'bold';
        } else {
            btn.style.backgroundColor = '#ecf0f1';
            btn.style.color = '#2c3e50';
            btn.style.fontWeight = 'normal';
        }
    });
}

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

document.getElementById('filter-pending').addEventListener('click', () => { 
    currentCalcFilter = 'pending'; 
    updateCalcFilterButtons();
    renderCalculator(); 
});
document.getElementById('filter-completed').addEventListener('click', () => { 
    currentCalcFilter = 'completed'; 
    updateCalcFilterButtons();
    renderCalculator(); 
});

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
        startDate = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0);
    } else if (range === 'lastMonth') {
        // از روز اول ماه قبل ساعت 00:00 تا آخرین ثانیه روز آخر ماه قبل
        startDate = new Date(now.getFullYear(), now.getMonth() - 1, 1, 0, 0, 0);
        endDate = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);
    } else if (range === 'custom') {
        if (dateFrom.value) startDate = new Date(dateFrom.value);
        if (dateTo.value) {
            endDate = new Date(dateTo.value);
            endDate.setHours(23, 59, 59, 999);
        }
    }

    filteredAllInvoices = allInvoicesRaw.filter(inv => {
        const invDate = getEffectiveDate(inv);
        if (!invDate) return true;
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
    
    let countrySalesRetail = {};
    let countrySalesWholesale = {};
    let countrySalesTotal = {};
    
    let sourceSalesRetail = {};
    let sourceSalesWholesale = {};
    let sourceSalesTotal = {};

    // ذخیره همزمان فروش، سود خالص و تعداد خرید برای هر کشور و منبع بازاریابی
    const addData = (obj, key, amount, profit) => {
        if(!obj[key]) obj[key] = { vol: 0, prof: 0, count: 0 };
        obj[key].vol += amount;
        obj[key].prof += profit;
        obj[key].count += 1;
    };

    filteredFinalInvoices.forEach(inv => {
        if (!inv.isProfitCalculated) return;

        const grandTotalEUR = convertToEuro(inv.grandTotal, inv.currency);
        const netProfitEUR = convertToEuro(inv.netProfit || 0, inv.currency);
        const country = inv.customerCountry || 'نامشخص';
        const source = inv.leadSource || 'ثبت نشده';

        if (inv.invoiceType === 'retail') {
            retVol += grandTotalEUR;
            retProf += netProfitEUR;
            addData(countrySalesRetail, country, grandTotalEUR, netProfitEUR);
            addData(sourceSalesRetail, source, grandTotalEUR, netProfitEUR);
        } else {
            whoVol += grandTotalEUR;
            whoProf += netProfitEUR;
            addData(countrySalesWholesale, country, grandTotalEUR, netProfitEUR);
            addData(sourceSalesWholesale, source, grandTotalEUR, netProfitEUR);
        }
        
        addData(countrySalesTotal, country, grandTotalEUR, netProfitEUR);
        addData(sourceSalesTotal, source, grandTotalEUR, netProfitEUR);
    });

    document.getElementById('dash-retail-vol').textContent = `${retVol.toFixed(2)} €`;
    document.getElementById('dash-wholesale-vol').textContent = `${whoVol.toFixed(2)} €`;
    document.getElementById('dash-retail-profit').textContent = `${retProf.toFixed(2)} €`;
    document.getElementById('dash-wholesale-profit').textContent = `${whoProf.toFixed(2)} €`;

    const oldTotalProfitCard = document.getElementById('dash-total-net-profit');
    if (oldTotalProfitCard && oldTotalProfitCard.closest('.summary-card')) {
        oldTotalProfitCard.closest('.summary-card').remove();
    }

    let totalCardsContainer = document.getElementById('dynamic-total-cards');
    if (!totalCardsContainer) {
        const topCountriesContainer = document.getElementById('top-countries');
        if (topCountriesContainer && topCountriesContainer.parentNode) {
            totalCardsContainer = document.createElement('div');
            totalCardsContainer.id = 'dynamic-total-cards';
            totalCardsContainer.style.cssText = 'display:flex; gap:15px; width:100%; margin-top:30px; margin-bottom:30px; flex-wrap:wrap;';
            topCountriesContainer.parentNode.insertBefore(totalCardsContainer, topCountriesContainer);
        }
    }
    
    if (totalCardsContainer) {
        totalCardsContainer.innerHTML = `
            <div style="flex:1; min-width:250px; background: linear-gradient(135deg, #2980b9, #6dd5ed); color: white; border: none; box-shadow: 0 4px 15px rgba(41, 128, 185, 0.2); padding:20px; border-radius:12px; text-align:center;">
                <h4 style="color: rgba(255,255,255,0.9); font-size: 15px; margin-bottom: 10px; font-weight: bold;">🌍 مجموع کل حجم فروش (تک + عمده)</h4>
                <span style="font-size: 28px; font-weight: bold; font-family: Tahoma;">${(retVol + whoVol).toFixed(2)} €</span>
            </div>
            <div style="flex:1; min-width:250px; background: linear-gradient(135deg, #11998e, #38ef7d); color: white; border: none; box-shadow: 0 4px 15px rgba(46, 204, 113, 0.2); padding:20px; border-radius:12px; text-align:center;">
                <h4 style="color: rgba(255,255,255,0.9); font-size: 15px; margin-bottom: 10px; font-weight: bold;">💰 مجموع کل سود خالص (تک + عمده)</h4>
                <span style="font-size: 28px; font-weight: bold; font-family: Tahoma;">${(retProf + whoProf).toFixed(2)} €</span>
            </div>
        `;
    }

    const renderTogglePanel = (container, title, icon, filterName, currentFilter, dataRetail, dataWholesale, dataTotal) => {
        container.style.cssText = 'width:100%; margin-bottom:20px;'; 
        container.innerHTML = `
            <div style="background:#fff; padding:20px; border-radius:12px; border:1px solid #eee; box-shadow:0 4px 10px rgba(0,0,0,0.03);">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:20px; border-bottom:1px solid #eee; padding-bottom:15px; flex-wrap:wrap; gap:10px;">
                    <h4 style="color:#2c3e50; margin:0; font-weight:bold; font-size:15px;">${icon} ${title}</h4>
                    <div style="display:flex; gap:15px; background:#f8f9fa; padding:8px 15px; border-radius:8px; border:1px solid #ddd;">
                        <label style="cursor:pointer; display:flex; align-items:center; gap:5px; font-size:13px; font-weight:bold; color:#16a085;">
                            <input type="radio" name="${filterName}" value="total" ${currentFilter === 'total' ? 'checked' : ''}> 📊 مجموع
                        </label>
                        <label style="cursor:pointer; display:flex; align-items:center; gap:5px; font-size:13px; font-weight:bold; color:#2980b9;">
                            <input type="radio" name="${filterName}" value="retail" ${currentFilter === 'retail' ? 'checked' : ''}> 🛍️ تک‌فروشی
                        </label>
                        <label style="cursor:pointer; display:flex; align-items:center; gap:5px; font-size:13px; font-weight:bold; color:#8e44ad;">
                            <input type="radio" name="${filterName}" value="wholesale" ${currentFilter === 'wholesale' ? 'checked' : ''}> 📦 عمده‌فروشی
                        </label>
                    </div>
                </div>
                <div class="${filterName}-content" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 20px;"></div>
            </div>
        `;

        const updateContent = (filterValue) => {
            const contentDiv = container.querySelector(`.${filterName}-content`);
            let dataObj = {};
            let totalVol = 0;
            let totalProf = 0;
            let color = '';

            if (filterValue === 'total') {
                dataObj = dataTotal;
                totalVol = retVol + whoVol;
                totalProf = retProf + whoProf;
                color = '#16a085';
            } else if (filterValue === 'retail') {
                dataObj = dataRetail;
                totalVol = retVol;
                totalProf = retProf;
                color = '#2980b9';
            } else if (filterValue === 'wholesale') {
                dataObj = dataWholesale;
                totalVol = whoVol;
                totalProf = whoProf;
                color = '#8e44ad';
            }

            const sorted = Object.entries(dataObj).sort((a,b) => b[1].vol - a[1].vol);
            
            if(sorted.length === 0) {
                contentDiv.innerHTML = `<p style="font-size:13px; color:#777; width:100%; grid-column: 1 / -1; text-align:center;">داده‌ای در این بازه زمانی ثبت نشده است.</p>`;
                return;
            }

            let html = '';
            sorted.forEach(([itemName, itemData], idx) => {
                const itemVol = itemData.vol;
                const itemProf = itemData.prof || 0;
                const itemCount = itemData.count;
                const perc = totalVol > 0 ? ((itemVol / totalVol) * 100).toFixed(1) : 0;
                const profPerc = totalProf > 0 ? ((itemProf / totalProf) * 100).toFixed(1) : 0;
                
                html += `<div>
                    <div style="display:flex; justify-content:space-between; align-items:center; font-size:14px; margin-bottom:6px;">
                        <div>
                            <span style="display:block; margin-bottom:4px;">${idx + 1}. <strong>${itemName}</strong></span>
                            <span style="font-size:11px; color:#34495e; background:#f1f2f6; padding:2px 6px; border-radius:4px; font-weight:bold; border: 1px solid #e0e0e0; display:inline-block;">تعداد: ${itemCount} خرید</span>
                        </div>
                        <div style="text-align:left;">
                            <span style="color:${color}; font-weight:bold; display:block; margin-bottom:3px; font-size:13px;">فروش: ${perc}% <span style="font-size:11px; color:#7f8c8d; font-weight:normal;">(${itemVol.toFixed(2)} €)</span></span>
                            <span style="color:#27ae60; font-weight:bold; display:block; font-size:12px;">سود: ${profPerc}% <span style="font-size:11px; color:#7f8c8d; font-weight:normal;">(${itemProf.toFixed(2)} €)</span></span>
                        </div>
                    </div>
                    <div style="width:100%; background:#f1f2f6; height:8px; border-radius:4px; overflow:hidden;">
                        <div style="width:${perc}%; background:${color}; height:100%; border-radius:4px; transition: width 0.5s ease;"></div>
                    </div>
                </div>`;
            });
            contentDiv.innerHTML = html;
        };

        container.querySelectorAll(`input[name="${filterName}"]`).forEach(radio => {
            radio.addEventListener('change', (e) => {
                if(filterName === 'country-filter') currentCountryFilter = e.target.value;
                if(filterName === 'source-filter') currentSourceFilter = e.target.value;
                updateContent(e.target.value);
            });
        });

        updateContent(currentFilter);
    };

    const tcDiv = document.getElementById('top-countries');
    if (tcDiv) {
        renderTogglePanel(tcDiv, 'سهم کشورها از بازار جهانی', '🌍', 'country-filter', currentCountryFilter, countrySalesRetail, countrySalesWholesale, countrySalesTotal);
    }

    let sourcesDiv = document.getElementById('top-sources');
    if (!sourcesDiv && tcDiv && tcDiv.parentNode) {
        sourcesDiv = document.createElement('div');
        sourcesDiv.id = 'top-sources';
        tcDiv.parentNode.insertBefore(sourcesDiv, tcDiv.nextSibling);
    }
    
    if (sourcesDiv) {
        renderTogglePanel(sourcesDiv, 'عملکرد منابع بازاریابی (Lead Sources)', '🎯', 'source-filter', currentSourceFilter, sourceSalesRetail, sourceSalesWholesale, sourceSalesTotal);
    }

    drawTrendChart();
}

// ----------------------------------------------------
// نمودار روند زمانی بهینه‌شده برای موبایل و دسکتاپ
// ----------------------------------------------------
let trendChartInstance = null;

function drawTrendChart() {
    let anchorEl = document.getElementById('top-sources') || document.getElementById('top-countries');
    if (!anchorEl) return;
    
    const dashboardTab = anchorEl.closest('.tab-content') || anchorEl.parentElement.parentElement;
    
    let trendContainer = document.getElementById('historical-trend-container');
    if (!trendContainer) {
        trendContainer = document.createElement('div');
        trendContainer.id = 'historical-trend-container';
        trendContainer.style.cssText = 'width: 100%; background: #fff; padding: 25px; border: 1px solid #eee; border-radius: 12px; box-shadow: 0 4px 15px rgba(0,0,0,0.05); margin-top: 30px; text-align: center;';
        trendContainer.innerHTML = `
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px; flex-wrap: wrap; gap: 10px; direction: rtl;">
                <div style="text-align: right;">
                    <h4 style="color: #2c3e50; font-size: 16px; font-weight: bold; margin: 0;">📈 بنچمارک تحلیل روند کلان فروش و سود خالص</h4>
                    <span style="font-size: 11px; color: #7f8c8d;">💡 روی هر ستون لمس کنید یا انگشت خود را بکشید تا جزئیات کامل آن ماه را ببینید</span>
                </div>
                <div style="display: flex; gap: 8px; align-items: center;">
                    <button id="trend-monthly-btn" class="btn btn-small btn-blue" style="padding: 6px 14px; font-size: 12px;"> نمای ماهانه</button>
                    <button id="trend-yearly-btn" class="btn btn-small btn-gray" style="padding: 6px 14px; font-size: 12px; background-color: #7f8c8d;"> نمای سالانه</button>
                </div>
            </div>
            <div style="position: relative; height: 370px; width: 100%;">
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
        let dateObj = getEffectiveDate(inv);
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
        salesTimelineData.push(Number(trendGroups[k].sales.toFixed(2)));
        profitTimelineData.push(Number(trendGroups[k].profit.toFixed(2)));
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

    // پلاگین اختصاصی برای نوشتن اعداد خوانا و مرتب روی نمودار
    const smartLabelsPlugin = {
        id: 'smartLabelsPlugin',
        afterDatasetsDraw(chart) {
            const { ctx } = chart;
            ctx.save();
            ctx.font = 'bold 11px Tahoma';
            ctx.textAlign = 'center';

            // نمایش اعداد فروش روی میله‌ها
            const barMeta = chart.getDatasetMeta(0);
            barMeta.data.forEach((bar, index) => {
                const val = salesData[index];
                if (val > 0) {
                    const text = Math.round(val).toLocaleString('en-US') + '€';
                    ctx.fillStyle = '#1f618d';
                    ctx.fillText(text, bar.x, bar.y - 6);
                }
            });

            // نمایش اعداد سود خالص روی نقاط خط سبز با کادر سفید خوانا
            const lineMeta = chart.getDatasetMeta(1);
            lineMeta.data.forEach((point, index) => {
                const val = profitData[index];
                if (val > 0) {
                    const text = Math.round(val).toLocaleString('en-US') + '€';
                    const textWidth = ctx.measureText(text).width;
                    const boxX = point.x - (textWidth / 2) - 4;
                    const boxY = point.y - 24;

                    ctx.fillStyle = 'rgba(255, 255, 255, 0.92)';
                    ctx.strokeStyle = '#27ae60';
                    ctx.lineWidth = 1;
                    ctx.beginPath();
                    ctx.roundRect ? ctx.roundRect(boxX, boxY, textWidth + 8, 16, 4) : ctx.rect(boxX, boxY, textWidth + 8, 16);
                    ctx.fill();
                    ctx.stroke();

                    ctx.fillStyle = '#1e8449';
                    ctx.fillText(text, point.x, boxY + 12);
                }
            });

            ctx.restore();
        }
    };

    trendChartInstance = new Chart(trendCtx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [
                {
                    label: '🔵 مجموع حجم کل فروش (€)',
                    data: salesData,
                    backgroundColor: 'rgba(52, 152, 219, 0.65)',
                    borderColor: '#2980b9',
                    borderWidth: 2,
                    borderRadius: 6,
                    yAxisID: 'y',
                    order: 2
                },
                {
                    label: '🟢 مجموع کل سود خالص (€)',
                    data: profitData,
                    backgroundColor: '#2ecc71',
                    borderColor: '#27ae60',
                    borderWidth: 3,
                    pointBackgroundColor: '#fff',
                    pointBorderColor: '#27ae60',
                    pointBorderWidth: 3,
                    pointRadius: 6,
                    pointHoverRadius: 9,
                    pointHitRadius: 30, // افزایش محدوده لمس در موبایل
                    type: 'line',
                    tension: 0.3,
                    yAxisID: 'y1',
                    order: 1
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            layout: {
                padding: { top: 25 }
            },
            // 🔥 فعال‌سازی حالت لمس مغناطیسی ستونی برای موبایل 🔥
            interaction: {
                mode: 'index',
                intersect: false
            },
            scales: {
                x: { grid: { display: false }, ticks: { font: { family: 'Tahoma', size: 11, weight: 'bold' } } },
                y: {
                    type: 'linear',
                    display: true,
                    position: 'right',
                    grace: '15%',
                    title: { display: true, text: 'حجم کل فروش (€)', font: { family: 'Tahoma', weight: 'bold' } },
                    ticks: { font: { family: 'Tahoma' } }
                },
                y1: {
                    type: 'linear',
                    display: true,
                    position: 'left',
                    grace: '20%',
                    grid: { drawOnChartArea: false },
                    title: { display: true, text: 'سود خالص واقعی (€)', font: { family: 'Tahoma', weight: 'bold' } },
                    ticks: { font: { family: 'Tahoma' } }
                }
            },
            plugins: {
                legend: { position: 'top', labels: { font: { family: 'Tahoma', weight: 'bold', size: 12 }, padding: 15 } },
                tooltip: {
                    backgroundColor: 'rgba(44, 62, 80, 0.95)',
                    padding: 12,
                    bodyFont: { family: 'Tahoma', size: 13 },
                    titleFont: { family: 'Tahoma', size: 14, weight: 'bold' },
                    callbacks: {
                        label: function(context) {
                            return ` ${context.dataset.label}: ${Number(context.raw).toFixed(2)} €`;
                        }
                    }
                }
            }
        },
        plugins: [smartLabelsPlugin]
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
// بخش محاسبه سود، جستجوی سراسری، نهایی‌سازی و ثبت منبع
// ----------------------------------------------------
function renderCalculator() {
    const calcList = document.getElementById('calculator-list');
    calcList.innerHTML = '';

    // استخراج تمام منابع بازاریابی ثبت‌شده در سیستم
    const dynamicSources = new Set(baseLeadSources);
    allInvoicesRaw.forEach(inv => {
        if (inv.leadSource && inv.leadSource.trim() !== '') {
            dynamicSources.add(inv.leadSource);
        }
    });
    const finalSourcesList = Array.from(dynamicSources);

    let listToShow = [];

    // اگر کاربر عبارتی در باکس جستجو وارد کرده باشد، در کل دیتابیس بدون محدودیت تاریخ بگردد
    if (calcSearchQuery !== '') {
        listToShow = allInvoicesRaw.filter(inv => {
            const matchInvNo = (inv.invoiceNumber || '').toLowerCase().includes(calcSearchQuery);
            const matchName = (inv.customerName || '').toLowerCase().includes(calcSearchQuery);
            const matchPhone = (inv.customerPhone || '').toLowerCase().includes(calcSearchQuery);
            return matchInvNo || matchName || matchPhone;
        });
    } else {
        if (currentCalcFilter === 'initial') {
            // نمایش تمام پیش‌فاکتورهای ثبت اولیه تا بتوان مستقیم از همین‌جا نهایی‌شان کرد
            listToShow = allInvoicesRaw.filter(inv => inv.status === 'ثبت اولیه');
        } else {
            listToShow = filteredFinalInvoices.filter(inv => {
                const isCalculated = inv.isProfitCalculated === true;
                return currentCalcFilter === 'pending' ? !isCalculated : isCalculated;
            });
        }
    }

    // 🔥 مرتب‌سازی دقیق بر اساس تاریخ نهایی شدن (جدیدترین در بالای لیست) 🔥
    listToShow.sort((a, b) => getEffectiveMillis(b) - getEffectiveMillis(a));

    if (listToShow.length === 0) {
        calcList.innerHTML = `<p style="text-align:center; padding:20px; color:#7f8c8d;">هیچ فاکتوری در این بخش یافت نشد.</p>`;
        return;
    }

    listToShow.forEach(inv => {
        const div = document.createElement('div');
        div.className = 'inv-card';
        
        const createdDateStr = inv.timestamp && typeof inv.timestamp.toDate === 'function' ? new Date(inv.timestamp.toDate()).toLocaleDateString('en-GB') : '-';
        const finalizedDateObj = (inv.status === 'نهایی' && inv.finalizedAt) ? getEffectiveDate(inv) : null;
        const finalizedDateStr = finalizedDateObj ? finalizedDateObj.toLocaleDateString('en-GB') : null;

        const shippingCharged = parseFloat(inv.shippingCost) || 0;
        const discount = parseFloat(inv.discount) || 0;
        const sellerName = inv.salespersonName || 'نامشخص'; 
        
        let statusOptions = '';
        statusLabels.forEach(lbl => {
            statusOptions += `<option value="${lbl}" ${inv.status === lbl ? 'selected' : ''}>${lbl}</option>`;
        });

        let sourceOptions = `<option value="">منبع آشنایی...</option>`;
        finalSourcesList.forEach(src => {
            sourceOptions += `<option value="${src}" ${inv.leadSource === src ? 'selected' : ''}>${src}</option>`;
        });
        sourceOptions += `<option value="add_new" style="background:#f1f2f6; font-weight:bold; color:#2980b9;">➕ منبع جدید...</option>`;

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
            <div class="inv-header" style="flex-wrap: wrap; gap: 10px;">
                <div style="display:flex; align-items:center; flex-wrap:wrap; gap:8px;">
                    <span style="font-size:18px; font-weight:bold;">${inv.invoiceNumber}</span>
                    <span style="font-size:12px; background:#f1c40f; color:#000; padding:3px 8px; border-radius:4px;">${inv.invoiceType === 'retail' ? 'تک فروشی' : 'عمده فروشی'}</span>
                    <span style="font-size:11px; background:${inv.isProfitCalculated ? '#2ecc71' : '#e67e22'}; color:#fff; padding:3px 8px; border-radius:4px;">${inv.isProfitCalculated ? '✅ سود محاسبه شده' : '⏳ در انتظار محاسبه'}</span>
                    <span style="font-size:12px; color:#ecf0f1;">📅 صدور: ${createdDateStr} ${finalizedDateStr ? `| 🎯 نهایی: <strong>${finalizedDateStr}</strong>` : ''}</span>
                </div>
                <div style="display:flex; align-items:center; flex-wrap:wrap; gap:10px; font-size:14px;">
                    <span>مشتری: <strong>${inv.customerName}</strong> (${inv.customerCountry || '-'})</span> | 
                    <span style="color: #a29bfe; font-weight: bold;">👤 فروشنده: ${sellerName}</span> | 
                    <span>مبلغ فاکتور: <strong style="color:#f1c40f;">${inv.grandTotal.toFixed(2)} ${inv.currency}</strong></span>
                    <select class="calc-source-select" data-id="${inv.id}" data-col="${inv.collectionName}" style="padding:4px 8px; border-radius:4px; border:1px solid #e67e22; background:#fdf2e9; font-family:inherit; font-size:12px; cursor:pointer;">
                        ${sourceOptions}
                    </select>
                    <select class="calc-status-select" data-id="${inv.id}" data-col="${inv.collectionName}" style="padding:4px 8px; border-radius:4px; border:none; background:${inv.status === 'نهایی' ? '#27ae60' : '#ecf0f1'}; color:${inv.status === 'نهایی' ? '#fff' : '#2c3e50'}; font-weight:bold; font-family:inherit; font-size:12px; cursor:pointer;">
                        ${statusOptions}
                    </select>
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
                            <p style="margin-bottom:0;">📦 سود/زیان ارسال: <span id="shipping-profit-${inv.id}" style="font-weight:bold;">0.00</span> ${inv.currency}</p>
                            ${discount > 0 ? `<p style="color:#e74c3c; margin-top:5px; margin-bottom:0;">📉 تخفیف فاکتور: ${discount}${inv.currency}</p>` : ''}
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

        // رویداد تغییر منبع آشنایی مشتری مستقیماً در صفحه سود
        const sourceSelect = div.querySelector('.calc-source-select');
        sourceSelect.addEventListener('change', async (e) => {
            let newValue = e.target.value;
            if (newValue === 'add_new') {
                const customSource = prompt("لطفاً نام منبع جدید را وارد کنید (مثلاً: فیسبوک):");
                if (customSource && customSource.trim() !== '') {
                    newValue = customSource.trim();
                } else {
                    e.target.value = inv.leadSource || '';
                    return;
                }
            }
            try {
                e.target.disabled = true;
                await updateDoc(doc(db, inv.collectionName, inv.id), { leadSource: newValue });
                const invIndexRaw = allInvoicesRaw.findIndex(i => i.id === inv.id && i.collectionName === inv.collectionName);
                if (invIndexRaw > -1) allInvoicesRaw[invIndexRaw].leadSource = newValue;
                e.target.disabled = false;
                applyDateFilter();
            } catch (err) {
                alert("خطا در ثبت منبع آشنایی");
                e.target.disabled = false;
            }
        });

        // رویداد تغییر وضعیت فاکتور (نهایی کردن مستقیم در صفحه سود)
        const statusSelect = div.querySelector('.calc-status-select');
        statusSelect.addEventListener('change', async (e) => {
            const newStatus = e.target.value;
            try {
                e.target.disabled = true;
                const updatePayload = { status: newStatus };
                // ثبت تاریخ دقیق نهایی شدن فقط زمانی که فاکتور به حالت نهایی تغییر می‌کند
                if (newStatus === 'نهایی' && inv.status !== 'نهایی') {
                    updatePayload.finalizedAt = serverTimestamp();
                }
                await updateDoc(doc(db, inv.collectionName, inv.id), updatePayload);
                const invIndexRaw = allInvoicesRaw.findIndex(i => i.id === inv.id && i.collectionName === inv.collectionName);
                if (invIndexRaw > -1) {
                    if (newStatus === 'نهایی' && allInvoicesRaw[invIndexRaw].status !== 'نهایی') {
                        allInvoicesRaw[invIndexRaw].finalizedAt = new Date();
                    }
                    allInvoicesRaw[invIndexRaw].status = newStatus;
                }
                e.target.disabled = false;
                applyDateFilter();
            } catch (err) {
                alert("خطا در تغییر وضعیت فاکتور");
                e.target.disabled = false;
            }
        });

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

            const updatePayload = {
                items: updatedItems,
                actualShippingCost: actualShip,
                costOfGoods: totalCostOfGoods,
                netProfit: netProfit,
                isProfitCalculated: true
            };

            // اگر فاکتور هنوز ثبت اولیه بود، با ذخیره سود خودکار نهایی شود و تاریخ امروز را بگیرد
            const wasNotFinal = inv.status !== 'نهایی';
            if (wasNotFinal) {
                updatePayload.status = 'نهایی';
                updatePayload.finalizedAt = serverTimestamp();
            }

            try {
                await updateDoc(doc(db, inv.collectionName, inv.id), updatePayload);

                saveBtn.textContent = "✔️ ذخیره شد";
                
                const invIndexRaw = allInvoicesRaw.findIndex(i => i.id === inv.id && i.collectionName === inv.collectionName);
                if (invIndexRaw > -1) {
                    allInvoicesRaw[invIndexRaw].items = updatedItems;
                    allInvoicesRaw[invIndexRaw].actualShippingCost = actualShip;
                    allInvoicesRaw[invIndexRaw].netProfit = netProfit;
                    allInvoicesRaw[invIndexRaw].isProfitCalculated = true;
                    if (wasNotFinal) {
                        allInvoicesRaw[invIndexRaw].status = 'نهایی';
                        allInvoicesRaw[invIndexRaw].finalizedAt = new Date();
                    }
                }
                
                setTimeout(() => {
                    applyDateFilter();
                }, 600);

            } catch (e) {
                alert("خطا در ذخیره اطلاعات.");
                saveBtn.disabled = false;
                saveBtn.textContent = "💾 تایید و ذخیره سود";
            }
        });
    });
}
