// profit.js
import { db, auth } from './firebase-config.js';
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.11.0/firebase-auth.js";
import { collection, getDocs, doc, updateDoc, query, where } from "https://www.gstatic.com/firebasejs/10.11.0/firebase-firestore.js";

// 🔴🔴🔴 ایمیل مدیریت خود را دقیقاً اینجا بنویس 🔴🔴🔴
const ADMIN_EMAIL = "ramin.paradise800@gmail.com"; 

let allFinalInvoices = [];
let filteredInvoices = [];
let currentCalcFilter = 'pending'; 

let exchangeRates = null;
const currencyCodes = { "€": "EUR", "£": "GBP", "$": "USD" };

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
        allFinalInvoices = [];
        const qRetail = query(collection(db, "Retail_Invoices"), where("status", "==", "نهایی"));
        const retSnap = await getDocs(qRetail);
        retSnap.forEach(doc => allFinalInvoices.push({ id: doc.id, collectionName: "Retail_Invoices", ...doc.data() }));

        const qWholesale = query(collection(db, "Wholesale_Invoices"), where("status", "==", "نهایی"));
        const whoSnap = await getDocs(qWholesale);
        whoSnap.forEach(doc => allFinalInvoices.push({ id: doc.id, collectionName: "Wholesale_Invoices", ...doc.data() }));

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

    filteredInvoices = allFinalInvoices.filter(inv => {
        if (!inv.timestamp) return true;
        const invDate = inv.timestamp.toDate();
        return invDate >= startDate && invDate <= endDate;
    });

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

    filteredInvoices.forEach(inv => {
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
    
    filteredInvoices.forEach(inv => {
        if (!inv.isProfitCalculated) return;

        const seller = inv.salespersonName || 'نامشخص';
        if (!sellerData[seller]) sellerData[seller] = { ret: 0, who: 0, prof: 0 };
        
        const grandTotalEUR = convertToEuro(inv.grandTotal, inv.currency);
        const netProfitEUR = convertToEuro(inv.netProfit || 0, inv.currency);

        if (inv.invoiceType === 'retail') sellerData[seller].ret += grandTotalEUR;
        else sellerData[seller].who += grandTotalEUR;
        
        sellerData[seller].prof += netProfitEUR;
    });

    const tbody = document.getElementById('sellers-stats-body');
    tbody.innerHTML = '';
    for (const [name, stats] of Object.entries(sellerData)) {
        tbody.innerHTML += `<tr>
            <td style="font-weight:bold;">${name}</td>
            <td style="color:#2980b9;">~ ${stats.ret.toFixed(2)} €</td>
            <td style="color:#8e44ad;">~ ${stats.who.toFixed(2)} €</td>
            <td style="color:#27ae60; font-weight:bold;">~ ${stats.prof.toFixed(2)} €</td>
        </tr>`;
    }
}

function renderCalculator() {
    const calcList = document.getElementById('calculator-list');
    calcList.innerHTML = '';

    const listToShow = filteredInvoices.filter(inv => {
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
        const sellerName = inv.salespersonName || 'نامشخص'; // گرفتن نام فروشنده
        
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
                
                const invIndex = allFinalInvoices.findIndex(i => i.id === inv.id);
                if (invIndex > -1) {
                    allFinalInvoices[invIndex].items = updatedItems;
                    allFinalInvoices[invIndex].actualShippingCost = actualShip;
                    allFinalInvoices[invIndex].netProfit = netProfit;
                    allFinalInvoices[invIndex].isProfitCalculated = true;
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