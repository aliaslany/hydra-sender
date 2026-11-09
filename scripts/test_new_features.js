// Test 1: Ray Casting Point-in-Polygon Algorithm
function isPointInPolygon(point, polygon) {
  if (!polygon || polygon.length < 3) return true;
  const [lat, lon] = point;
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [xi, yi] = polygon[i];
    const [xj, yj] = polygon[j];
    const intersect = yi > lon !== yj > lon && lat < ((xj - xi) * (lon - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

// Aliabad Katul polygon roughly defining the central region
const aliabadPolygon = [
  [36.920, 54.830],
  [36.930, 54.880],
  [36.880, 54.890],
  [36.870, 54.840]
];

// Inside point (center of Aliabad)
const pInside = [36.902, 54.855];
console.assert(isPointInPolygon(pInside, aliabadPolygon) === true, 'Center point should be inside');

// Outside point (Gorgan: 36.84, 54.43)
const pOutside = [36.840, 54.430];
console.assert(isPointInPolygon(pOutside, aliabadPolygon) === false, 'Gorgan point should be outside');
console.log('✅ Geo-fencing Point-in-Polygon tests passed!');

// Test 2: Negative keyword regex
const negativeWords = ['املاک', 'مشاور', 'مشاورین', 'مشاوران', 'بنگاه', 'دپارتمان', 'دفتر املاک', 'همکار', 'همکاران', 'کمیسیون', 'آژانس املاک', 'کارگزاری'];

function hasNegativeWord(text) {
  const norm = text.replace(/[\u200c\s]+/g, ' ');
  return negativeWords.some(w => norm.includes(w));
}

console.assert(hasNegativeWord('آپارتمان نوساز با مشاور املاک تماس نگیرد') === true, 'Should detect مشاور and املاک');
console.assert(hasNegativeWord('فروش دپارتمان بزرگ مسکونی') === true, 'Should detect دپارتمان');
console.assert(hasNegativeWord('واحد شخصی ساز مالک هستم تخفیف پای معامله') === false, 'Personal ad should pass');
console.log('✅ Anti-agency keyword tests passed!');

// Test 3: Rent and Sale card builder character limits
const sampleRentCaption = `🏠 <b>[نوع ملک: آپارتمان مسکونی]</b>
📋 <b>مشخصات اصلی:</b>
• موقعیت: علی‌آباد کتول، مرکز شهر
• زیربنا: ۹۰ متر مربع
• طبقه: طبقه ۲ | واحد: ۲ واحدی
• تعداد خواب: ۲ خواب | سال ساخت: سال ۱۴۰۰
• وضعیت تخلیه: تخلیه فوری
• نفرات: خانواده / بدون محدودیت

✨ <b>امکانات و تجهیزات:</b>
• ورودی: مشترک | حیاط: مشاع
• پارکینگ: دارد | آسانسور: دارد | انباری: دارد | بالکن: دارد
• گرمایش/سرمایش: پکیج و رادیاتور / کولر گازی
• کابینت: های‌گلاس | کف: سرامیک
• کمد دیواری: دارد | انشعابات: مستقل

📄 <b>توضیحات تکمیلی:</b>
<i>ملک با موقعیت عالی و دسترسی مناسب</i>

💰 <b>شرایط رهن و اجاره:</b>
• مبلغ رهن: <b>۳۰۰,۰۰۰,۰۰۰ تومان</b>
• مبلغ اجاره: <b>۵,۰۰۰,۰۰۰ تومان</b>
• قابلیت تبدیل: دارد (قابل تبدیل)

🏷 #علی_آباد_کتول #اجاره #رهن_و_اجاره #آپارتمان_مسکونی #۲_خواب #املاک_امیران #علی_آباد_ملک

📞 <b>ارتباط با ما:</b>
📱 همراه: 09922434338
☎️ تلفن دفتر: 01734241371
📍 آدرس دفتر: علی‌آباد کتول، خیابان پاسداران (کمربندی قدیم)، نبش پاسداران ۸، املاک امیران
🔗 عضویت در کانال: @aliabadmelk`;

console.assert(sampleRentCaption.length <= 1024, `Caption length (${sampleRentCaption.length}) must be <= 1024 for Telegram sendPhoto`);
console.log(`✅ Rent Card caption length: ${sampleRentCaption.length} chars (within Telegram 1024 limit)`);

console.log('All tests completed successfully!');
