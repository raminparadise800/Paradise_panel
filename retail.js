// retail.js
import { db, auth } from './firebase-config.js';
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.11.0/firebase-auth.js";
import { collection, addDoc, doc, getDoc, updateDoc, setDoc, serverTimestamp, getDocs } from "https://www.gstatic.com/firebasejs/10.11.0/firebase-firestore.js";

// 🔴🔴 ایمیل مدیریت خود را بنویس 🔴🔴
const ADMIN_EMAIL = "your-email@gmail.com"; 

onAuthStateChanged(auth, (user) => {
    if (user) {
        if (user.email.toLowerCase() === ADMIN_EMAIL.toLowerCase()) {
            document.getElementById('admin-panel-btn').style.display = 'flex';
        }
    } else {
        window.location.href = "login.html";
    }
});

document.getElementById('current-date').textContent = new Date().toLocaleDateString('en-GB');

let generatedInvoiceNumber = 'INV-' + Math.floor(100000 + Math.random() * 900000);

const invoiceBody = document.getElementById('invoice-body');
const addRowBtn = document.getElementById('add-row-btn');
const saveExportBtn = document.getElementById('save-export-btn'); 
const shareBtn = document.getElementById('share-btn');
const shippingInput = document.getElementById('shipping-cost');
const discountInput = document.getElementById('discount');
const sellerSelect = document.getElementById('salesperson-select');
const invoiceTypeSelect = document.getElementById('invoice-type');
const countrySelect = document.getElementById('cust-country');
const langSelector = document.getElementById('lang-selector');

let currentCurrency = "€";
const currencyCodes = { "€": "EUR", "£": "GBP", "$": "USD" };

const dictionary = {
    en: { invoice: "INVOICE", customer: "Customer", date: "Date:", seller: "Seller", desc: "Description", price: "Price", qty: "Quantity", total: "Total", subtotal: "TOTAL PRICE", discount: "Discount", grandtotal: "GRAND TOTAL", shipOpt: "Shipping Cost", cargoOpt: "Cargo Cost" },
    it: { invoice: "FATTURA", customer: "Cliente", date: "Data:", seller: "Azienda", desc: "Descrizione", price: "Prezzo", qty: "Quantità", total: "Totale", subtotal: "PREZZO TOTALE", discount: "Sconto", grandtotal: "TOTALE GENERALE", shipOpt: "Costo di Spedizione", cargoOpt: "Costo del Carico" },
    es: { invoice: "FACTURA", customer: "Cliente", date: "Fecha:", seller: "Empresa", desc: "Descripción", price: "Precio", qty: "Cantidad", total: "Total", subtotal: "PRECIO TOTAL", discount: "Descuento", grandtotal: "GRAN TOTAL", shipOpt: "Gastos de Envío", cargoOpt: "Costo de Carga" },
    ar: { invoice: "فاتورة", customer: "العميل", date: "التاريخ:", seller: "الشركة", desc: "الوصف", price: "السعر", qty: "الكمية", total: "المجموع", subtotal: "السعر الإجمالي", discount: "خصم", grandtotal: "المجموع الإجمالي", shipOpt: "تكلفة الشحن", cargoOpt: "تكلفة الشحن" }
};

const urlParams = new URLSearchParams(window.location.search);
const isEditMode = urlParams.get('edit') === 'true';
const editId = urlParams.get('id');
const editCol = urlParams.get('col');

async function init() {
    await loadSellers();
    await loadCountries();

    if (isEditMode) {
        saveExportBtn.textContent = "💾 بروزرسانی فاکتور و دریافت عکس";
        saveExportBtn.style.backgroundColor = "#f39c12"; 
        invoiceTypeSelect.disabled = true; 
        invoiceTypeSelect.title = "در حالت ویرایش نمی‌توانید نوع فاکتور را بین تک و عمده تغییر دهید.";

        try {
            const docSnap = await getDoc(doc(db, editCol, editId));
            if (docSnap.exists()) {
                const data = docSnap.data();
                
                generatedInvoiceNumber = data.invoiceNumber || generatedInvoiceNumber;
                document.getElementById('invoice-number').textContent = generatedInvoiceNumber;
                document.getElementById('cust-phone').value = data.customerPhone || '';
                document.getElementById('cust-name').value = data.customerName || '';
                document.getElementById('cust-country').value = data.customerCountry || '';
                document.getElementById('cust-address').value = data.customerAddress || '';
                invoiceTypeSelect.value = data.invoiceType || '';
                sellerSelect.value = data.salespersonId || '';
                
                currentCurrency = data.currency || '€';
                document.getElementById('currency-selector').value = currentCurrency;
                document.querySelectorAll('.cur-sym').forEach(el => el.textContent = currentCurrency);

                shippingInput.value = data.shippingCost || 0;
                discountInput.value = data.discount || 0;

                invoiceBody.innerHTML = ''; 
                
                if(data.items && data.items.length > 0) {
                    data.items.forEach(item => {
                        const tr = createRow();
                        tr.querySelector('.item-name').value = item.name || '';
                        tr.querySelector('.item-price').value = item.price || 0;
                        tr.querySelector('.item-qty').value = item.qty || 0;
                        tr.querySelector('.item-weight').value = item.weight || 0;
                        tr.querySelector('.item-ship-discount').value = item.shipDiscount || 0;
                        
                        tr.querySelector('.item-price').dataset.baseValue = item.price || 0;
                        tr.querySelector('.item-ship-discount').dataset.baseValue = item.shipDiscount || 0;
                    });
                } else {
                    createRow(); createRow();
                }
                calculateTotals();
            } else {
                alert("فاکتور مورد نظر پیدا نشد!");
            }
        } catch (error) {
            console.error("Error fetching invoice", error);
        }
    } else {
        document.getElementById('invoice-number').textContent = generatedInvoiceNumber;
        createRow(); createRow();
    }
}

async function loadSellers() {
    try {
        const querySnapshot = await getDocs(collection(db, "Salespersons"));
        querySnapshot.forEach((doc) => {
            const opt = document.createElement('option');
            opt.value = doc.id; opt.textContent = doc.data().name;
            sellerSelect.appendChild(opt);
        });
    } catch (e) { console.error(e); }
}

async function loadCountries() {
    try {
        const querySnapshot = await getDocs(collection(db, "Countries"));
        querySnapshot.forEach((doc) => {
            const opt = document.createElement('option');
            opt.value = doc.data().name; opt.textContent = doc.data().name;
            countrySelect.appendChild(opt);
        });
    } catch (e) { console.error(e); }
}

document.getElementById('add-country-btn').addEventListener('click', async () => {
    const newCountry = prompt("نام کشور جدید را به انگلیسی وارد کنید:");
    if(newCountry && newCountry.trim() !== "") {
        await addDoc(collection(db, "Countries"), { name: newCountry.trim() });
        const opt = document.createElement('option');
        opt.value = newCountry.trim(); opt.textContent = newCountry.trim();
        countrySelect.appendChild(opt);
        countrySelect.value = newCountry.trim();
    }
});

function saveBaseState(e) { e.target.dataset.baseValue = e.target.value; e.target.dataset.baseCurrency = currentCurrency; }
function saveBaseText(e) { e.target.dataset.baseText = e.target.value; }

shippingInput.dataset.baseValue = 0; shippingInput.dataset.baseCurrency = currentCurrency;
shippingInput.addEventListener('input', saveBaseState);
discountInput.dataset.baseValue = 0; discountInput.dataset.baseCurrency = currentCurrency;
discountInput.addEventListener('input', saveBaseState);

function calculateTotals() {
    let subTotal = 0; 
    let totalWeight = 0;
    let totalShipDiscount = 0;

    document.querySelectorAll('#invoice-body tr').forEach(row => {
        const price = parseFloat(row.querySelector('.item-price').value) || 0;
        const qty = parseFloat(row.querySelector('.item-qty').value) || 0;
        const weight = parseFloat(row.querySelector('.item-weight').value) || 0;
        const shipDiscount = parseFloat(row.querySelector('.item-ship-discount').value) || 0;

        const rowTotal = price * qty;
        row.querySelector('.row-total').textContent = rowTotal.toFixed(2);
        
        subTotal += rowTotal; 
        totalWeight += (weight * qty);
        totalShipDiscount += (shipDiscount * qty);
    });

    const shipping = parseFloat(shippingInput.value) || 0;
    const discount = parseFloat(discountInput.value) || 0;
    const grandTotal = (subTotal + shipping) - discount;

    document.getElementById('sub-total').textContent = subTotal.toFixed(2);
    document.getElementById('grand-total').textContent = grandTotal.toFixed(2);
    document.getElementById('total-weight-display').textContent = totalWeight;
    document.getElementById('total-ship-discount-display').textContent = totalShipDiscount.toFixed(2);
}

shippingInput.addEventListener('input', calculateTotals);
discountInput.addEventListener('input', calculateTotals);

function createRow() {
    const tr = document.createElement('tr');
    tr.innerHTML = `
        <td><input type="text" class="item-name" placeholder="e.g. Shoes"></td>
        <td><span class="cur-sym" style="font-size:14px;">${currentCurrency}</span> <input type="number" class="item-price" placeholder="0" style="width:70%;"></td>
        <td><input type="number" class="item-qty" placeholder="0"></td>
        <td style="font-weight:bold;"><span class="cur-sym">${currentCurrency}</span> <span class="row-total">0.00</span></td>
        <td class="no-print" style="background: #ecf0f1;"><input type="number" class="item-weight" placeholder="0" style="width:100%;"></td>
        <td class="no-print" style="background: #e8f8f5;"><input type="number" class="item-ship-discount" placeholder="0" style="width:100%;"></td>
        <td class="no-print"><button class="btn-danger remove-row" style="padding:4px 8px; border:none; border-radius:4px; color:white; cursor:pointer;">X</button></td>
    `;
    invoiceBody.appendChild(tr);

    const priceInput = tr.querySelector('.item-price');
    const nameInput = tr.querySelector('.item-name');
    const shipDiscInput = tr.querySelector('.item-ship-discount');
    
    priceInput.dataset.baseValue = 0; priceInput.dataset.baseCurrency = currentCurrency;
    shipDiscInput.dataset.baseValue = 0; shipDiscInput.dataset.baseCurrency = currentCurrency;

    nameInput.addEventListener('input', saveBaseText); 
    priceInput.addEventListener('input', saveBaseState);
    shipDiscInput.addEventListener('input', saveBaseState);
    
    tr.querySelectorAll('input').forEach(input => input.addEventListener('input', calculateTotals));
    tr.querySelector('.remove-row').addEventListener('click', () => { tr.remove(); calculateTotals(); });
    return tr;
}

addRowBtn.addEventListener('click', createRow);

langSelector.addEventListener('change', async (e) => {
    const lang = e.target.value;
    const dict = dictionary[lang];
    if(!dict) return;

    document.getElementById('lbl-invoice').textContent = dict.invoice;
    document.getElementById('lbl-customer').textContent = dict.customer;
    document.getElementById('lbl-date').textContent = dict.date;
    document.getElementById('lbl-seller').textContent = dict.seller;
    document.getElementById('lbl-desc').textContent = dict.desc;
    document.getElementById('lbl-price').textContent = dict.price;
    document.getElementById('lbl-qty').textContent = dict.qty;
    document.getElementById('lbl-total').textContent = dict.total;
    document.getElementById('lbl-subtotal').textContent = dict.subtotal;
    document.getElementById('lbl-discount').textContent = dict.discount;
    document.getElementById('lbl-grandtotal').textContent = dict.grandtotal;

    const captureDiv = document.getElementById('invoice-capture');
    if(lang === 'ar') { captureDiv.style.direction = 'rtl'; captureDiv.style.textAlign = 'right'; } 
    else { captureDiv.style.direction = 'ltr'; captureDiv.style.textAlign = 'left'; }

    const items = document.querySelectorAll('.item-name');
    if (lang === 'en') {
        items.forEach(input => { if(input.dataset.baseText) input.value = input.dataset.baseText; });
        return;
    }

    const originalBtnText = saveExportBtn.textContent;
    saveExportBtn.textContent = "⏳ در حال ترجمه...";
    saveExportBtn.disabled = true;

    try {
        for(let input of items) {
            let textToTranslate = input.dataset.baseText || input.value;
            if(textToTranslate.trim() !== '') {
                const res = await fetch(`https://api.mymemory.translated.net/get?q=${encodeURIComponent(textToTranslate)}&langpair=en|${lang}`);
                const data = await res.json();
                if(data.responseData && data.responseData.translatedText) input.value = data.responseData.translatedText;
            }
        }
    } catch(e) { console.error("Translation Error", e); } 
    finally { saveExportBtn.textContent = originalBtnText; saveExportBtn.disabled = false; }
});

document.getElementById('currency-selector').addEventListener('change', async (e) => {
    const newCurrency = e.target.value;
    if (newCurrency === currentCurrency) return;

    const originalBtnText = saveExportBtn.textContent;
    saveExportBtn.textContent = "⏳ در حال دریافت نرخ...";
    saveExportBtn.disabled = true;

    try {
        const response = await fetch(`https://open.er-api.com/v6/latest/USD`);
        const data = await response.json();
        const rates = data.rates;
        const getRate = (fromCurrSym, toCurrSym) => rates[currencyCodes[toCurrSym]] / rates[currencyCodes[fromCurrSym]];

        const convertInput = (input) => {
            let baseVal = parseFloat(input.dataset.baseValue) || 0;
            if (baseVal === 0) return;
            let baseCurr = input.dataset.baseCurrency || currentCurrency;

            if (baseCurr === newCurrency) {
                input.value = baseVal;
            } else {
                let rate = getRate(baseCurr, newCurrency);
                let exactValue = baseVal * rate;
                input.value = (Math.ceil(exactValue * 2) / 2).toFixed(2);
            }
        };

        document.querySelectorAll('.item-price').forEach(input => convertInput(input));
        document.querySelectorAll('.item-ship-discount').forEach(input => convertInput(input));
        convertInput(shippingInput); 
        convertInput(discountInput);

        currentCurrency = newCurrency;
        document.querySelectorAll('.cur-sym').forEach(el => el.textContent = currentCurrency);
        calculateTotals();

    } catch (error) { alert("خطا در شبکه."); e.target.value = currentCurrency; } 
    finally { saveExportBtn.textContent = originalBtnText; saveExportBtn.disabled = false; }
});

saveExportBtn.addEventListener('click', async () => {
    const phone = document.getElementById('cust-phone').value;
    const name = document.getElementById('cust-name').value || "Unknown";
    const country = countrySelect.value;
    const salespersonId = sellerSelect.value;
    const invoiceType = invoiceTypeSelect.value;
    
    if (!invoiceType || !salespersonId || !phone || !country) {
        return alert("اخطار: وارد کردن 'شماره تماس'، 'کشور'، 'نوع فاکتور' و 'فروشنده' الزامی است.");
    }

    const items = [];
    document.querySelectorAll('#invoice-body tr').forEach(row => {
        const itemName = row.querySelector('.item-name').value;
        if(itemName) {
            items.push({
                name: itemName,
                weight: parseFloat(row.querySelector('.item-weight').value) || 0,
                shipDiscount: parseFloat(row.querySelector('.item-ship-discount').value) || 0,
                price: parseFloat(row.querySelector('.item-price').value) || 0,
                qty: parseFloat(row.querySelector('.item-qty').value) || 0,
                total: parseFloat(row.querySelector('.row-total').textContent)
            });
        }
    });

    saveExportBtn.textContent = "⏳ در حال پردازش...";
    saveExportBtn.disabled = true;

    const collectionName = invoiceType === 'wholesale' ? "Wholesale_Invoices" : "Retail_Invoices";
    const totalWeight = parseFloat(document.getElementById('total-weight-display').textContent);
    const totalShipDiscount = parseFloat(document.getElementById('total-ship-discount-display').textContent);

    const invoicePayload = {
        invoiceType: invoiceType, customerName: name, customerPhone: phone, customerCountry: country,
        customerAddress: document.getElementById('cust-address').value, salespersonId: salespersonId, 
        salespersonName: sellerSelect.options[sellerSelect.selectedIndex].text,
        currency: currentCurrency, items: items, 
        totalWeight: totalWeight, 
        totalShipDiscountGuide: totalShipDiscount,
        shippingCost: parseFloat(shippingInput.value) || 0, discount: parseFloat(discountInput.value) || 0, 
        grandTotal: parseFloat(document.getElementById('grand-total').textContent)
    };

    try {
        if (isEditMode) {
            invoicePayload.lastEdited = serverTimestamp();
            await updateDoc(doc(db, editCol, editId), invoicePayload);
        } else {
            invoicePayload.invoiceNumber = generatedInvoiceNumber;
            invoicePayload.status = "ثبت اولیه";
            invoicePayload.timestamp = serverTimestamp();
            await addDoc(collection(db, collectionName), invoicePayload);
        }
        
        await setDoc(doc(db, "Customers", phone), { name: name, phone: phone, country: country, lastUpdate: serverTimestamp() }, { merge: true });
        
        const invoiceElement = document.getElementById('invoice-capture');
        const printLabel = document.getElementById('print-shipping-label');
        printLabel.textContent = document.getElementById('shipping-type').options[document.getElementById('shipping-type').selectedIndex].text;
        printLabel.style.display = 'inline-block';
        
        const inputs = invoiceElement.querySelectorAll('input, select');
        const spans = [];
        inputs.forEach(input => {
            if(!input.classList.contains('no-print') && input.type !== 'hidden') {
                const span = document.createElement('span');
                span.textContent = input.value || '';
                span.style.cssText = 'font-weight:bold; font-size:14px;';
                if(input.classList.contains('item-name')) span.style.textAlign = 'left';
                input.parentNode.insertBefore(span, input);
                input.style.display = 'none';
                spans.push({input, span});
            }
        });

        invoiceElement.classList.add('print-mode');

        // 🔥 مجبور کردن دوربین برای در نظر گرفتن عرض کامپیوتر 🔥
        html2canvas(invoiceElement, { 
            scale: 2, 
            useCORS: true, 
            backgroundColor: "#ffffff",
            windowWidth: 850, 
            width: 850
        }).then(canvas => {
            canvas.toBlob(async (blob) => {
                const fileName = `${generatedInvoiceNumber}-${name}.png`;
                const file = new File([blob], fileName, { type: 'image/png' });
                
                const link = document.createElement('a');
                link.download = fileName; link.href = URL.createObjectURL(blob); link.click();
                
                invoiceElement.classList.remove('print-mode');
                printLabel.style.display = 'none';
                spans.forEach(item => { item.span.remove(); item.input.style.display = ''; });

                saveExportBtn.style.display = 'none'; shareBtn.style.display = 'block';

                shareBtn.onclick = async () => {
                    if (navigator.canShare && navigator.canShare({ files: [file] })) {
                        try { await navigator.share({ files: [file], title: 'Invoice' }); window.location.href = isEditMode ? 'history.html' : 'retail.html'; } catch (error) { console.log(error); }
                    } else { alert("ذخیره شد."); window.location.href = isEditMode ? 'history.html' : 'retail.html'; }
                };
            }, 'image/png');
        });

    } catch (e) { console.error(e); alert("خطا در ارتباط با دیتابیس."); saveExportBtn.disabled = false; }
});

init();
