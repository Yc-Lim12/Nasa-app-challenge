/*
 * Trend Detective: English / Bahasa Malaysia.
 * English text is the key. Page text marked with data-i18n is swapped in place;
 * strings built in code go through TD.T(), which calls TDi18n.tr().
 * Anything without a translation stays in English.
 */
(function () {
  'use strict';

  var BM = {
    // ---- page text ----
    'Is it really <em>changing?</em>': 'Adakah ia benar-benar <em>berubah?</em>',
    'Spin the Earth and click any place. <strong>Forty years of NASA data</strong> and two statistics tests tell you whether a change is real, or just the usual wobble from year to year.':
      'Putar Bumi dan klik mana-mana tempat. <strong>Empat puluh tahun data NASA</strong> dan dua ujian statistik memberitahu sama ada sesuatu perubahan itu benar, atau sekadar turun naik biasa dari tahun ke tahun.',
    'Ask a question': 'Tanya soalan',
    'Ask: Is Penang getting rainier?': 'Tanya: Adakah Pulau Pinang semakin kerap hujan?',
    'Globe': 'Glob', 'Trend map': 'Peta tren', 'Timelapse': 'Selang masa', 'Rain now': 'Hujan kini', 'Wind': 'Angin',
    'Malaysia stories': 'Kisah Malaysia', 'Case file': 'Fail kes', 'Methods': 'Kaedah',
    '5-year average': 'Purata 5 tahun', 'If the trend continues': 'Jika tren berterusan',
    'Save chart as image': 'Simpan carta sebagai imej', 'Copy a link to this case': 'Salin pautan kes ini',
    'Download these numbers as CSV': 'Muat turun nombor ini sebagai CSV', 'Scan every variable': 'Imbas semua pemboleh ubah',
    'Values': 'Nilai', 'Difference from average': 'Beza daripada purata', 'Compare with': 'Bandingkan dengan',
    'Compare two variables': 'Bandingkan dua pemboleh ubah',
    'See whether two things change together at this place, for example temperature and cloud cover.':
      'Lihat sama ada dua perkara berubah bersama di tempat ini, contohnya suhu dan litupan awan.',
    'What to investigate': 'Apa yang hendak disiasat', 'Where': 'Di mana', 'When': 'Bila',
    'Case settings': 'Tetapan kes', 'What, where and when': 'Apa, di mana dan bila', 'The evidence': 'Bukti',
    'Which months are changing most?': 'Bulan manakah paling banyak berubah?', 'What else is changing here?': 'Apa lagi yang berubah di sini?',
    'How it works': 'Cara ia berfungsi', 'How to read this': 'Cara membaca keputusan ini', 'Show the numbers as a table': 'Tunjukkan nombor dalam jadual',
    '<strong>Ask a question, or choose what to test.</strong> Air temperature, rainfall, haze, soil wetness, sunlight and more.':
      '<strong>Tanya soalan, atau pilih apa yang hendak diuji.</strong> Suhu udara, hujan, jerebu, kelembapan tanah, cahaya matahari dan banyak lagi.',
    '<strong>Click a place on the globe.</strong> Anywhere on Earth, or one of the named places.':
      '<strong>Klik satu tempat pada glob.</strong> Di mana-mana di Bumi, atau salah satu tempat yang dinamakan.',
    '<strong>Read the verdict.</strong> NASA data and two statistics tests say whether the change is real.':
      '<strong>Baca keputusan.</strong> Data NASA dan dua ujian statistik menyatakan sama ada perubahan itu benar.',
    'Every answer comes from live NASA data, so a new case takes a few seconds.':
      'Setiap jawapan datang terus daripada data NASA, jadi kes baharu mengambil masa beberapa saat.',
    '<strong>A student project.</strong> Trend Detective was built by team Sunway to the Moon for the 2026 NASA Space Apps Challenge, “Be An Earth System Trend Detective!”. It is not made, reviewed or endorsed by NASA. It is for learning, not for official, legal or safety decisions.':
      '<strong>Projek pelajar.</strong> Trend Detective dibina oleh pasukan Sunway to the Moon untuk NASA Space Apps Challenge 2026, “Be An Earth System Trend Detective!”. Ia tidak dibuat, disemak atau disokong oleh NASA. Ia untuk pembelajaran, bukan untuk keputusan rasmi, undang-undang atau keselamatan.',

    // ---- chart ----
    'Yearly value': 'Nilai tahunan', 'Trend, extended': 'Tren, dilanjutkan', 'Trend line': 'Garis tren',

    // ---- verdict ----
    'each {month} from {a} to {b}': 'setiap {month} dari {a} hingga {b}',
    'from {a} to {b}': 'dari {a} hingga {b}',
    '{x} per decade': '{x} sedekad',
    '{name} around {where} has not changed.': '{name} di sekitar {where} tidak berubah.',
    'No trend': 'Tiada tren',
    'The typical year-to-year change {period} is zero.': 'Perubahan biasa dari tahun ke tahun {period} ialah sifar.',
    '{name} around {where} is rising by about {rate}.': '{name} di sekitar {where} meningkat kira-kira {rate}.',
    '{name} around {where} is falling by about {rate}.': '{name} di sekitar {where} menurun kira-kira {rate}.',
    'Statistically significant': 'Signifikan secara statistik',
    'Measured {period}. A pattern this steady would be very unlikely to appear by chance alone.':
      'Diukur {period}. Corak yang sekukuh ini amat tidak mungkin muncul secara kebetulan.',
    '{name} around {where} may be rising, by about {rate}.': '{name} di sekitar {where} mungkin meningkat, kira-kira {rate}.',
    '{name} around {where} may be falling, by about {rate}.': '{name} di sekitar {where} mungkin menurun, kira-kira {rate}.',
    'Borderline': 'Hampir signifikan',
    'Measured {period}. The evidence is suggestive but not strong enough to rule out chance. A longer record could settle it.':
      'Diukur {period}. Buktinya membayangkan perubahan tetapi belum cukup kuat untuk menolak faktor kebetulan. Rekod yang lebih panjang boleh memastikannya.',
    '{name} around {where} shows no clear trend.': '{name} di sekitar {where} tidak menunjukkan tren yang jelas.',
    'Not statistically significant': 'Tidak signifikan secara statistik',
    'Measured {period}. The line tilts up by about {rate}, but that is within the normal ups and downs from year to year.':
      'Diukur {period}. Garisnya condong ke atas kira-kira {rate}, tetapi itu masih dalam turun naik biasa dari tahun ke tahun.',
    'Measured {period}. The line tilts down by about {rate}, but that is within the normal ups and downs from year to year.':
      'Diukur {period}. Garisnya condong ke bawah kira-kira {rate}, tetapi itu masih dalam turun naik biasa dari tahun ke tahun.',
    'Not proven yet. The change is tiny next to the year-to-year wobble, so it would take more than 150 more years of data to tell.':
      'Belum terbukti. Perubahannya terlalu kecil berbanding turun naik tahunan, jadi lebih daripada 150 tahun lagi data diperlukan untuk memastikannya.',
    'Not proven yet. If this trend is real, about {n} more years of data would be needed to tell.':
      'Belum terbukti. Jika tren ini benar, kira-kira {n} tahun lagi data diperlukan untuk memastikannya.',
    'The record is already long enough to detect a trend this size, so the true trend is probably smaller than it looks, or absent.':
      'Rekod ini sudah cukup panjang untuk mengesan tren sebesar ini, jadi tren sebenar mungkin lebih kecil daripada yang kelihatan, atau tiada langsung.',
    'Significant': 'Signifikan', 'No clear trend': 'Tiada tren jelas',

    // ---- evidence tiles ----
    'per decade': 'sedekad', 'Rate of change': 'Kadar perubahan', 'Total change': 'Jumlah perubahan',
    'Slope of the straight line through the points. With 95% confidence the true rate is between {a} and {b}.':
      'Kecerunan garis lurus melalui titik-titik. Dengan keyakinan 95%, kadar sebenar adalah antara {a} dan {b}.',
    'Along the trend line from {a} to {b} ({n} years of data).': 'Sepanjang garis tren dari {a} hingga {b} ({n} tahun data).',
    'Mann-Kendall test': 'Ujian Mann-Kendall',
    'Checks whether later years are mostly higher or lower than earlier ones. Below 0.05 counts as significant. Kendall’s tau is {t} (1 is always rising, −1 always falling).':
      'Menyemak sama ada tahun-tahun kemudian kebanyakannya lebih tinggi atau lebih rendah daripada tahun-tahun awal. Di bawah 0.05 dikira signifikan. Tau Kendall ialah {t} (1 sentiasa meningkat, −1 sentiasa menurun).',
    't-test on the slope': 'Ujian-t ke atas kecerunan',
    'The chance of seeing a slope this steep if there were really no trend. The line explains {r}% of the year-to-year variation.':
      'Peluang melihat kecerunan securam ini jika sebenarnya tiada tren. Garis ini menerangkan {r}% daripada variasi tahunan.',
    'Sen’s slope': 'Kecerunan Sen',
    'The middle value of the slopes between every pair of years. One freak year barely moves it.':
      'Nilai tengah kecerunan antara setiap pasangan tahun. Satu tahun luar biasa hampir tidak menjejaskannya.',
    'Years needed to tell': 'Tahun diperlukan untuk pasti', 'more years': 'tahun lagi', 'Enough': 'Mencukupi',
    'How long a record a trend of this size needs before a test can reliably detect it ({n} years in total), from Weatherhead et al. (1998).':
      'Berapa panjang rekod yang diperlukan oleh tren sebesar ini sebelum ujian dapat mengesannya dengan yakin ({n} tahun keseluruhannya), berdasarkan Weatherhead et al. (1998).',

    // ---- spikes ----
    '{years} stand out from the rest.': '{years} menonjol berbanding tahun lain.',
    '{years} stands out from the rest.': '{years} menonjol berbanding tahun lain.',
    'In {y} the value was {amt} above the trend line, about {z} times the usual year-to-year wobble.':
      'Pada {y}, nilainya {amt} di atas garis tren, kira-kira {z} kali ganda turun naik tahunan biasa.',
    'In {y} the value was {amt} below the trend line, about {z} times the usual year-to-year wobble.':
      'Pada {y}, nilainya {amt} di bawah garis tren, kira-kira {z} kali ganda turun naik tahunan biasa.',
    'That is a one-off spike, not a trend.': 'Itu lonjakan sekali sahaja, bukan tren.',
    'Without it, the trend is still significant ({rate}).': 'Tanpanya, tren masih signifikan ({rate}).',
    'Without it, the trend becomes significant ({rate}).': 'Tanpanya, tren menjadi signifikan ({rate}).',
    'Without it, the trend is no longer significant ({rate}), so the spike was doing the work.':
      'Tanpanya, tren tidak lagi signifikan ({rate}), jadi lonjakan itulah yang mewujudkan tren.',
    'Without it, there is still no significant trend ({rate}).': 'Tanpanya, masih tiada tren yang signifikan ({rate}).',
    'Spike, not trend': 'Lonjakan, bukan tren',

    // ---- buttons, status ----
    'Asking NASA…': 'Bertanya kepada NASA…', 'Asking NASA': 'Bertanya kepada NASA', 'Investigate': 'Siasat', 'Nothing': 'Tiada',
    'NASA POWER answered with error {status}.': 'NASA POWER membalas dengan ralat {status}.',
    'Could not reach NASA POWER. Check your internet connection and try again.': 'Tidak dapat menghubungi NASA POWER. Semak sambungan internet anda dan cuba lagi.',
    'There is not enough {what} data for {where} in that period.': 'Data {what} tidak mencukupi untuk {where} bagi tempoh itu.',
    'Fetching {what} for {where} from NASA POWER…': 'Sedang mendapatkan {what} untuk {where} daripada NASA POWER…',
    'Only {n} usable years of {what} here for that period. A trend test needs at least {min}. Try a longer period, another place or another variable.':
      'Hanya {n} tahun data {what} yang boleh digunakan untuk tempoh ini. Ujian tren memerlukan sekurang-kurangnya {min} tahun. Cuba tempoh lebih panjang, tempat lain atau pemboleh ubah lain.',
    'Scanning all {n} variables…': 'Sedang mengimbas kesemua {n} pemboleh ubah…',
    'Scanning {n} variables. This takes about half a minute for a box…': 'Sedang mengimbas {n} pemboleh ubah. Ini mengambil masa kira-kira setengah minit bagi setiap kotak…',
    'Scanned {done} of {n} variables…': 'Telah mengimbas {done} daripada {n} pemboleh ubah…',
    'Run the same test on every variable for this place and period, and see which ones are worth a closer look.':
      'Jalankan ujian yang sama bagi setiap pemboleh ubah di tempat dan tempoh ini untuk melihat yang mana wajar diteliti dengan lebih lanjut.',
    'yearly average': 'purata tahunan', '{month} average': 'purata {month}',
    '{sig} of {n} variables show a significant trend here. Click a name to open it.':
      '{sig} daripada {n} pemboleh ubah menunjukkan tren yang signifikan di sini. Klik nama untuk membukanya.',
    'Not enough data here for: {items}.': 'Data tidak mencukupi di sini untuk: {items}.',
    'With {n} tests at the 0.05 level, expect about one false alarm in twenty even where nothing is changing. Treat this list as leads to investigate, not proof.':
      'Dengan {n} ujian pada aras 0.05, jangkakan kira-kira satu amaran palsu bagi setiap dua puluh ujian walaupun tiada perubahan. Anggap senarai ini sebagai petunjuk untuk disiasat, bukan bukti.',
    'Variable': 'Pemboleh ubah', 'Direction': 'Arah', 'Strength (tau)': 'Kekuatan (tau)',
    'Change per decade': 'Perubahan setiap dekad', 'Mann-Kendall p': 'Nilai p Mann-Kendall', 'Verdict': 'Keputusan',
    'rising': 'meningkat', 'falling': 'menurun', 'flat': 'mendatar',

    // ---- compare two variables ----
    'Choose a second variable': 'Pilih pemboleh ubah kedua',
    'Loading {name} from NASA POWER…': 'Memuatkan {name} daripada NASA POWER…',
    'Not enough overlapping years to compare these two here.': 'Tidak cukup tahun yang bertindih untuk membandingkan kedua-duanya di sini.',
    'no clear': 'tidak jelas', 'a weak': 'lemah', 'a moderate': 'sederhana', 'a strong': 'kuat',
    '{a} and {b} show no clear link here (r = {r}).': '{a} dan {b} tidak menunjukkan hubungan yang jelas di sini (r = {r}).',
    'Years with high {a} tend to have high {b}: {s} link (r = {r}).': 'Tahun dengan {a} tinggi cenderung mempunyai {b} tinggi: hubungan {s} (r = {r}).',
    'Years with high {a} tend to have low {b}: {s} link (r = {r}).': 'Tahun dengan {a} tinggi cenderung mempunyai {b} rendah: hubungan {s} (r = {r}).',
    'After removing both long-term trends, the link is {s} (r = {r}), which shows how much of it is just two things changing over the same years.':
      'Selepas kedua-dua tren jangka panjang dibuang, hubungannya {s} (r = {r}), yang menunjukkan berapa banyak daripadanya hanyalah dua perkara yang berubah dalam tahun-tahun yang sama.',
    'A link is not proof that one causes the other.': 'Hubungan bukan bukti bahawa satu menyebabkan yang lain.',
    '{a} and {b} on a common scale': '{a} dan {b} pada skala yang sama',
    'Both shown as standard scores: 0 is each one’s average, ±1 a typical year’s swing.':
      'Kedua-duanya ditunjukkan sebagai skor piawai: 0 ialah purata masing-masing, ±1 ialah ayunan tahunan biasa.',
    'Data: NASA POWER (MERRA-2, CERES). Made with Trend Detective, a student project not endorsed by NASA.':
      'Data: NASA POWER (MERRA-2, CERES). Dibuat dengan Trend Detective, projek pelajar yang tidak disokong oleh NASA.',
    'Chart saved as an image.': 'Carta disimpan sebagai imej.', 'This browser could not save the chart.': 'Pelayar ini tidak dapat menyimpan carta.',

    // ---- case summary ----
    'Testing {what} around {where}, {when}, {part}.': 'Menguji {what} di sekitar {where}, {when}, {part}.',
    'in {month}': 'pada {month}', 'whole year': 'sepanjang tahun',

    // ---- map tools ----
    'centre': 'tengah', 'east': 'timur', 'north-east': 'timur laut', 'north': 'utara', 'north-west': 'barat laut',
    'west': 'barat', 'south-west': 'barat daya', 'south': 'selatan', 'south-east': 'tenggara',
    'NASA POWER returned no grid cells for this area.': 'NASA POWER tidak memulangkan sebarang sel grid untuk kawasan ini.',
    'Testing every grid cell in a {b}° box around this place…': 'Menguji setiap sel grid dalam kotak {b}° di sekitar tempat ini…',
    'There is not enough data here for this variable and period.': 'Tidak cukup data di sini untuk pemboleh ubah dan tempoh ini.',
    'Dot: statistically significant (p < 0.05). Red: going up, blue: going down, per decade.':
      'Titik: signifikan secara statistik (p < 0.05). Merah: meningkat, biru: menurun, sedekad.',
    '{s} of {n} grid cells show a significant trend: {u} rising, {d} falling.':
      '{s} daripada {n} sel grid menunjukkan tren yang signifikan: {u} meningkat, {d} menurun.',
    'Opposite trends found': 'Tren bertentangan ditemui',
    '{name} is rising in the {a} of this area but falling in the {b}. Same variable, same years, opposite directions.':
      '{name} meningkat di bahagian {a} kawasan ini tetapi menurun di bahagian {b}. Pemboleh ubah sama, tahun sama, arah bertentangan.',
    'Compare these two spots': 'Bandingkan dua titik ini', 'Rising': 'Meningkat', 'Falling': 'Menurun',
    'No opposite trends here: the significant cells all move the same way. Try rain or soil wetness, which often split.':
      'Tiada tren bertentangan di sini: semua sel yang signifikan bergerak ke arah yang sama. Cuba hujan atau kelembapan tanah, yang sering berbeza.',
    'No cell has a significant trend. Try a longer period or another variable.':
      'Tiada sel yang mempunyai tren signifikan. Cuba tempoh yang lebih panjang atau pemboleh ubah lain.',
    'Click any cell to open its full chart.': 'Klik mana-mana sel untuk membuka carta penuhnya.',
    'Loading every month in a {b}° box around this place…': 'Memuatkan setiap bulan dalam kotak {b}° di sekitar tempat ini…',
    'Colour shows how unusual each month was for that spot: red above its normal, blue below.':
      'Warna menunjukkan betapa luar biasanya setiap bulan bagi tempat itu: merah di atas normal, biru di bawah.',
    'Play': 'Main', 'Pause': 'Jeda', 'Month': 'Bulan', 'Difference from normal': 'Beza daripada normal', 'Monthly values': 'Nilai bulanan',
    'Could not load rain images from NASA GIBS.': 'Tidak dapat memuatkan imej hujan daripada NASA GIBS.',
    'Finding the latest NASA GPM rain image…': 'Mencari imej hujan NASA GPM terkini…',
    'No recent rain images are available right now. Try again later.': 'Tiada imej hujan terkini buat masa ini. Cuba lagi nanti.',
    'Loading the last 12 hours…': 'Memuatkan 12 jam terakhir…', 'Hour': 'Jam', 'Light': 'Renyai', 'Heavy': 'Lebat',
    'Satellite rain estimates for the last 12 hours, one frame per hour. Images: NASA GIBS. For viewing only, not used in the trend tests.':
      'Anggaran hujan satelit bagi 12 jam terakhir, satu bingkai sejam. Imej: NASA GIBS. Untuk tontonan sahaja, tidak digunakan dalam ujian tren.',
    'Loading 10 m wind for a {b}° box around this place…': 'Memuatkan angin 10 m bagi kotak {b}° di sekitar tempat ini…',
    'Map area': 'Kawasan peta', 'One grid cell (about 50 km)': 'Satu sel grid (kira-kira 50 km)', '{b}° box (about {km} km)': 'Kotak {b}° (kira-kira {km} km)', 'about {km} km': 'kira-kira {km} km',
    'This is the northeast monsoon season: winds blow from the north-east across the South China Sea.':
      'Ini musim monsun timur laut: angin bertiup dari timur laut merentasi Laut China Selatan.',
    'This is the southwest monsoon season: winds blow from the south-west, and the Strait of Malacca is drier.':
      'Ini musim monsun barat daya: angin bertiup dari barat daya, dan Selat Melaka lebih kering.',
    'Average at 10 m': 'Purata pada 10 m', 'Year': 'Tahun',
    'Each streak follows the average wind. Brighter streaks are faster. Average speed in this box: {s} m/s.':
      'Setiap jalur mengikut angin purata. Jalur yang lebih terang lebih laju. Kelajuan purata dalam kotak ini: {s} m/s.',

    // ---- stories ----
    'See the full case': 'Lihat kes penuh',
    'Time step': 'Langkah masa', 'One value per year': 'Satu nilai setahun', 'Every month, seasonal cycle removed': 'Setiap bulan, kitaran musim dibuang',
    'month by month': 'bulan demi bulan', 'each month minus its normal': 'setiap bulan tolak normalnya',
    'Monthly value': 'Nilai bulanan', 'Each month minus its normal': 'Setiap bulan tolak normalnya',
    'Used {n} of {t} years.': '{n} daripada {t} tahun digunakan.', 'Used {n} of {t} months.': '{n} daripada {t} bulan digunakan.',
    'No data for {y} here.': 'Tiada data untuk {y} di sini.', 'and {n} more': 'dan {n} lagi',
    '{y} skipped: missing months.': '{y} dilangkau: ada bulan yang tiada data.', '{y}: some months missing.': '{y}: ada bulan yang tiada data.',
    '{y} left out: not every month is in NASA POWER yet.': '{y} tidak dimasukkan: belum semua bulan ada dalam NASA POWER.',
    '{y} left out: December to February needs the December before, which is before the record starts.':
      '{y} tidak dimasukkan: Disember hingga Februari memerlukan Disember sebelumnya, yang berlaku sebelum rekod bermula.',
    'Neighbouring months are alike (lag-1 autocorrelation {r}), so {n} monthly values carry about as much independent information as {e}. Both tests were corrected for this.':
      'Bulan-bulan bersebelahan adalah serupa (autokorelasi lag-1 {r}), jadi {n} nilai bulanan membawa maklumat bebas lebih kurang sama seperti {e}. Kedua-dua ujian telah dibetulkan untuk ini.',
    'Neighbouring months are not alike here, so no correction for autocorrelation was needed.':
      'Bulan-bulan bersebelahan tidak serupa di sini, jadi tiada pembetulan autokorelasi diperlukan.',
    'Along the trend line from {a} to {b} ({n} months of data).': 'Sepanjang garis tren dari {a} hingga {b} ({n} bulan data).',
    'Each value is that month minus the average for the same calendar month in {a}–{b}.': 'Setiap nilai ialah bulan itu tolak purata bulan kalendar yang sama pada {a}–{b}.',
    'The whole region ({a}° × {b}°)': 'Seluruh kawasan ({a}° × {b}°)', 'loads in parts, about a minute': 'dimuat secara berperingkat, kira-kira seminit',
    'Fetching {v} for {p} from NASA POWER…': 'Mengambil {v} untuk {p} daripada NASA POWER…',
    'Fetching a big area in {b} parts from NASA POWER: {a} of {b} done…': 'Mengambil kawasan besar dalam {b} bahagian daripada NASA POWER: {a} daripada {b} siap…',
    'Only {n} usable years of {v} here for that period. A trend test needs at least {m}. Try a longer period, another place or another variable.':
      'Hanya {n} tahun data {v} yang boleh digunakan di sini untuk tempoh itu. Ujian tren memerlukan sekurang-kurangnya {m}. Cuba tempoh lebih panjang, tempat lain atau pemboleh ubah lain.',
    'Scanning every variable works for areas up to 10° × 10°. A bigger area would need dozens of slow requests. Choose a smaller area, or test variables one at a time.':
      'Imbasan semua pemboleh ubah berfungsi untuk kawasan sehingga 10° × 10°. Kawasan lebih besar memerlukan berpuluh permintaan yang perlahan. Pilih kawasan lebih kecil, atau uji satu pemboleh ubah pada satu masa.',
    'Peninsular Malaysia': 'Semenanjung Malaysia', 'all of Malaysia (with the sea between)': 'seluruh Malaysia (termasuk laut di antaranya)', 'Malaysia': 'Malaysia',
    'Adjusted for year-to-year memory.': 'Diselaraskan untuk ingatan dari tahun ke tahun.',
    'Neighbouring months are alike (lag-1 autocorrelation {r}), so {n} monthly values carry about as much independent information as {e}. Both tests were adjusted for this.':
      'Bulan-bulan bersebelahan adalah serupa (autokorelasi lag-1 {r}), jadi {n} nilai bulanan membawa maklumat bebas lebih kurang sama seperti {e}. Kedua-dua ujian telah diselaraskan untuk ini.',
    'Each year here resembles the year before it (lag-1 autocorrelation {r}), so {n} years carry about as much independent information as {e}. Both tests were adjusted for this.':
      'Setiap tahun di sini menyerupai tahun sebelumnya (autokorelasi lag-1 {r}), jadi {n} tahun membawa maklumat bebas lebih kurang sama seperti {e}. Kedua-dua ujian telah diselaraskan untuk ini.',
    'Grey areas: no satellite photo (polar night or no pass yet). NASA Blue Marble shown.': 'Kawasan kelabu: tiada foto satelit (malam kutub atau belum dilalui). NASA Blue Marble ditunjukkan.',
    'Grey areas: no satellite photo (polar night or no pass yet). NASA Blue Marble shown, with sea ice from {d} (NASA GHRSST).': 'Kawasan kelabu: tiada foto satelit (malam kutub atau belum dilalui). NASA Blue Marble ditunjukkan, dengan ais laut pada {d} (NASA GHRSST).',
    '{what} is only measured on land, and this spot is open ocean. Choose a place on land, or another variable.':
      '{what} hanya diukur di darat, dan tempat ini ialah lautan terbuka. Pilih tempat di darat, atau pemboleh ubah lain.',
    '{n} open-ocean cells were left out: NASA POWER has no soil there.': '{n} sel lautan terbuka tidak dimasukkan: NASA POWER tiada data tanah di sana.',
    'How to use': 'Cara guna', 'New here?': 'Baru di sini?', 'Show me': 'Tunjukkan', 'No thanks': 'Tidak, terima kasih', 'Close tour': 'Tutup lawatan',
    'Take a one-minute tour of what to click and what each part shows.': 'Ikuti lawatan seminit tentang apa yang perlu diklik dan apa yang ditunjukkan setiap bahagian.',
    'The globe': 'Glob', 'Ask a question': 'Tanya soalan', 'Not sure what to test?': 'Tidak pasti apa yang hendak diuji?', 'Map layers': 'Lapisan peta',
    'The answer': 'Jawapan', 'The chart': 'Carta', 'The evidence': 'Bukti', 'Change the case': 'Ubah kes', 'Ask AI': 'Tanya AI',
    'Drag to spin the Earth, scroll or pinch to zoom. Click any place to test it: forty years of NASA data are fetched for that spot.':
      'Seret untuk memutar Bumi, tatal atau cubit untuk zum. Klik mana-mana tempat untuk mengujinya: empat puluh tahun data NASA diambil untuk tempat itu.',
    'Or type a question in plain words, such as “Is Penang getting rainier?” or “Is the Arctic warming since 2000?”. It sets up the case for you.':
      'Atau taip soalan dalam bahasa mudah, seperti “Adakah Pulau Pinang semakin kerap hujan?”. Ia menyediakan kes untuk anda.',
    'Answer three short questions (what kind of place, what you are curious about, where) and get suggested NASA variables to test.':
      'Jawab tiga soalan ringkas (jenis tempat, apa yang anda ingin tahu, di mana) dan dapatkan cadangan pemboleh ubah NASA untuk diuji.',
    'Step-by-step examples with real data: city heat, haze, monsoon rain, a warming sea and wildfire smoke. A good place to start.':
      'Contoh langkah demi langkah dengan data sebenar: haba bandar, jerebu, hujan monsun, laut yang memanas dan asap kebakaran hutan. Tempat yang baik untuk bermula.',
    'Trend map: the trend in every grid cell around the place (a dot means significant). Timelapse: every month, one after another. Rain now and Wind: current conditions.':
      'Peta tren: tren dalam setiap sel grid di sekitar tempat itu (titik bermaksud signifikan). Selang masa: setiap bulan, satu demi satu. Hujan kini dan Angin: keadaan semasa.',
    'The verdict in one sentence: is it really changing, and how fast? The badge says whether the change is statistically significant or could be chance.':
      'Keputusan dalam satu ayat: adakah ia benar-benar berubah, dan berapa cepat? Lencana menunjukkan sama ada perubahan itu signifikan secara statistik atau mungkin kebetulan.',
    'One dot per year, with the trend line and its 95% range. Hover for values. Drag across the chart to test only part of the record. The coloured stripes show warm and cool years.':
      'Satu titik setahun, dengan garis tren dan julat 95%. Halakan tetikus untuk nilai. Seret merentasi carta untuk menguji sebahagian rekod sahaja. Jalur berwarna menunjukkan tahun panas dan sejuk.',
    'The numbers behind the verdict: rate per decade, total change, the two tests (Mann-Kendall and t-test) and how many years a test would need.':
      'Nombor di sebalik keputusan: kadar sedekad, jumlah perubahan, dua ujian (Mann-Kendall dan ujian-t) dan berapa tahun yang diperlukan oleh ujian.',
    'What, where and when: the variable, the place and area, the years, a season or a month, and one value per year or every month.':
      'Apa, di mana dan bila: pemboleh ubah, tempat dan kawasan, tahun, musim atau bulan, dan satu nilai setahun atau setiap bulan.',
    'Explains the result in plain words and answers questions about it. It works without an account; an OpenAI key in its settings gives longer answers.':
      'Menerangkan keputusan dalam bahasa mudah dan menjawab soalan tentangnya. Ia berfungsi tanpa akaun; kunci OpenAI dalam tetapannya memberi jawapan lebih panjang.',
    'Grid cells': 'Sel grid', 'Smooth': 'Licin', 'Opacity': 'Kelegapan', 'How to draw the grid': 'Cara melukis grid',
    'Guided stories': 'Kisah berpandu', 'World story': 'Kisah dunia',
    'Wildfire smoke over Wisconsin': 'Asap kebakaran hutan di Wisconsin', 'Summer haze far from the fires': 'Jerebu musim panas jauh dari kebakaran',
    'Haze, smoke and dust over Wisconsin, USA, in summer (June to August), one value per year since 2001. Look at 2021 and 2023, when smoke from wildfires in Canada drifted hundreds of kilometres south.':
      'Jerebu, asap dan debu di Wisconsin, Amerika Syarikat, pada musim panas (Jun hingga Ogos), satu nilai setahun sejak 2001. Lihat 2021 dan 2023, apabila asap kebakaran hutan di Kanada hanyut ratusan kilometer ke selatan.',
    'Is summer haze rising, or do a few smoke years only make it look that way? The “Spike, not trend” note flags years far from the trend line and runs the test again without them.':
      'Adakah jerebu musim panas meningkat, atau beberapa tahun berasap sahaja yang membuatnya kelihatan begitu? Nota “Lonjakan, bukan tren” menandakan tahun yang jauh dari garis tren dan menjalankan ujian semula tanpanya.',
    'If the verdict is “no clear trend”, that does not mean nothing is happening. A short or noisy record may simply need more years. “Years needed to tell” says how long a record a change this size needs before a test can detect it.':
      'Jika keputusannya “tiada tren jelas”, itu tidak bermaksud tiada apa-apa berlaku. Rekod yang pendek atau bising mungkin cuma memerlukan lebih banyak tahun. “Tahun diperlukan untuk pasti” menunjukkan berapa panjang rekod yang diperlukan sebelum ujian dapat mengesan perubahan sebesar ini.',
    'Every summer month on the map, one after another. The slider is set to June 2023. Press play to compare it with other summers.':
      'Setiap bulan musim panas pada peta, satu demi satu. Peluncur ditetapkan pada Jun 2023. Tekan main untuk membandingkannya dengan musim panas lain.',
    'Malaysia story': 'Kisah Malaysia', 'Step {a} of {b}': 'Langkah {a} daripada {b}', 'Close story': 'Tutup kisah',
    'Back': 'Kembali', 'Next': 'Seterusnya', 'Finish': 'Selesai',
    'Is KL getting hotter?': 'Adakah KL semakin panas?',
    'Days, nights and the map around the city': 'Siang, malam dan peta di sekitar bandar',
    'Start with air temperature over the Klang Valley: one value per year since 1981. Read the verdict. Is the rise steady enough to be real?':
      'Mulakan dengan suhu udara di Lembah Klang: satu nilai setahun sejak 1981. Baca keputusannya. Adakah kenaikannya cukup konsisten untuk dianggap benar?',
    'Now the night-time lows. Cities hold heat after dark, so nights often warm faster than days. Compare this rate with the first step.':
      'Sekarang suhu terendah waktu malam. Bandar menyimpan haba selepas gelap, jadi malam sering memanas lebih cepat daripada siang. Bandingkan kadar ini dengan langkah pertama.',
    'Is it only the city? The trend map tests every grid cell around the Klang Valley. Red is warming, and a dot means the warming is significant.':
      'Adakah hanya bandar? Peta tren menguji setiap sel grid di sekitar Lembah Klang. Merah bermaksud memanas, dan titik bermaksud pemanasan itu signifikan.',
    'If the trend continues: the dotted line carries today’s rate ten years past the data. It is a simple extension, not a forecast.':
      'Jika tren berterusan: garis putus-putus membawa kadar hari ini sepuluh tahun melepasi data. Ia sekadar lanjutan mudah, bukan ramalan.',
    'Haze: spikes or trend?': 'Jerebu: lonjakan atau tren?',
    'Smoke years against the long-term picture': 'Tahun berasap berbanding gambaran jangka panjang',
    'Haze, smoke and dust over the Klang Valley since 2001, as a yearly average. Look for years that stand out from the rest.':
      'Jerebu, asap dan debu di Lembah Klang sejak 2001, sebagai purata tahunan. Cari tahun-tahun yang menonjol berbanding yang lain.',
    'Only September, the peak of the haze season. Fire years such as 2015 and 2019 stand out. The “Spike, not trend” note checks whether they drive the trend or are one-off events.':
      'Hanya bulan September, kemuncak musim jerebu. Tahun kebakaran seperti 2015 dan 2019 menonjol. Nota “Lonjakan, bukan tren” menyemak sama ada ia memacu tren atau sekadar peristiwa sekali sahaja.',
    'Every September on the map, one year after another. The slider is set to September 2015: press play to compare the other years.':
      'Setiap September pada peta, tahun demi tahun. Peluncur ditetapkan pada September 2015: tekan main untuk membandingkan tahun-tahun lain.',
    'East vs west coast rain': 'Hujan pantai timur lawan pantai barat', 'Two coasts, two monsoons': 'Dua pantai, dua monsun',
    'Rain on the east coast of the Peninsula (Kelantan and Terengganu), with Penang on the west coast drawn on the same chart.':
      'Hujan di pantai timur Semenanjung (Kelantan dan Terengganu), dengan Pulau Pinang di pantai barat dilukis pada carta yang sama.',
    'December only, when the northeast monsoon soaks the east coast. Is monsoon rain there changing, and does Penang follow?':
      'Hanya bulan Disember, ketika monsun timur laut membasahi pantai timur. Adakah hujan monsun di sana berubah, dan adakah Pulau Pinang mengikut?',
    'Rain trends across the whole Peninsula. If one part grows wetter while another dries, the opposite-trend finder says so and marks both.':
      'Tren hujan di seluruh Semenanjung. Jika satu bahagian menjadi lebih basah sementara bahagian lain lebih kering, pencari tren bertentangan akan menyatakannya dan menandakan kedua-duanya.',
    'Why the coasts differ: the monsoon winds. In January they blow from the north-east onto the east coast. Tap “Jul” to see the southwest monsoon.':
      'Mengapa kedua-dua pantai berbeza: angin monsun. Pada Januari, angin bertiup dari timur laut ke pantai timur. Tekan “Jul” untuk melihat monsun barat daya.',
    'Is the sea around Malaysia warming?': 'Adakah laut di sekitar Malaysia semakin panas?',
    'The South China Sea and the Strait of Malacca': 'Laut China Selatan dan Selat Melaka',
    'Sea surface temperature in the South China Sea, off the east coast of the Peninsula.':
      'Suhu permukaan laut di Laut China Selatan, di luar pantai timur Semenanjung.',
    'The Strait of Malacca, between the Peninsula and Sumatra, drawn against the South China Sea spot.':
      'Selat Melaka, di antara Semenanjung dan Sumatera, dibandingkan dengan titik di Laut China Selatan.',
    'Warming across the whole area. Over the sea, dots mark the cells where the change is significant. Over land, this map shows ground temperature.':
      'Pemanasan di seluruh kawasan. Di atas laut, titik menandakan sel yang perubahannya signifikan. Di atas darat, peta ini menunjukkan suhu tanah.',

    // ---- question box ----
    'I could not tell what to measure, so I kept the current variable.': 'Saya tidak pasti apa yang hendak diukur, jadi saya kekalkan pemboleh ubah semasa.',
    'No place named, so I used the current one.': 'Tiada tempat dinyatakan, jadi saya gunakan tempat semasa.',
    'Understood': 'Difahami',
    'No answer here': 'Tiada jawapan di sini', 'See the case file for why': 'Lihat fail kes untuk sebabnya',

    // ---- topics and variables ----
    'Heat': 'Haba', 'Water': 'Air', 'Soil': 'Tanah', 'Sky': 'Langit', 'Air': 'Udara',
    'Air temperature': 'Suhu udara',
    'How warm the air is about 2 metres above the ground, the height where weather stations measure.':
      'Betapa panasnya udara kira-kira 2 meter di atas tanah, ketinggian yang diukur oleh stesen cuaca.',
    'Daytime high temperature': 'Suhu tertinggi siang',
    'The hottest the air gets during the day, averaged over the month.': 'Suhu udara paling panas pada waktu siang, dipuratakan sepanjang bulan.',
    'Night-time low temperature': 'Suhu terendah malam',
    'The coolest the air gets, usually just before sunrise, averaged over the month.':
      'Suhu udara paling sejuk, biasanya sejurus sebelum matahari terbit, dipuratakan sepanjang bulan.',
    'Ground surface temperature': 'Suhu permukaan tanah',
    'How hot the surface itself is (soil, roads, rooftops or water), not the air above it.':
      'Betapa panasnya permukaan itu sendiri (tanah, jalan, bumbung atau air), bukan udara di atasnya.',
    'Rain and snowfall': 'Hujan dan salji',
    'Average precipitation per day. Rain and melted snow are counted together.': 'Purata kerpasan sehari. Hujan dan salji cair dikira bersama.',
    'Evaporation from land': 'Penyejatan dari darat',
    'Water leaving the land as vapour, from soil and from plants. Blank over open ocean.':
      'Air yang meninggalkan daratan sebagai wap, dari tanah dan tumbuhan. Kosong di atas laut terbuka.',
    'Relative humidity': 'Kelembapan relatif',
    'How full of water vapour the air is, compared with the most it could hold at that temperature.':
      'Betapa penuhnya udara dengan wap air, berbanding jumlah maksimum yang boleh ditampungnya pada suhu itu.',
    'Water vapour above you': 'Wap air di atas anda',
    'All the water vapour in the column of air above one square metre of ground.': 'Semua wap air dalam turus udara di atas satu meter persegi tanah.',
    'Sea surface temperature': 'Suhu permukaan laut',
    'How warm the top of the sea is. Choose a spot over open water; over land this shows the ground temperature instead.':
      'Betapa panasnya permukaan laut. Pilih titik di atas laut terbuka; di atas darat ini menunjukkan suhu tanah.',
    'Snow depth': 'Kedalaman salji', 'How deep the snow lying on the ground is.': 'Kedalaman salji yang terletak di atas tanah.',
    'Topsoil wetness': 'Kelembapan tanah atas',
    'How wet the top few centimetres of soil are, from 0 (completely dry) to 1 (completely soaked).':
      'Betapa basahnya beberapa sentimeter teratas tanah, dari 0 (kering sepenuhnya) hingga 1 (tepu sepenuhnya).',
    'Root-zone soil wetness': 'Kelembapan tanah zon akar',
    'How wet the soil is down where plant roots drink, from 0 (completely dry) to 1 (completely soaked).':
      'Betapa basahnya tanah di tempat akar tumbuhan menyerap air, dari 0 (kering sepenuhnya) hingga 1 (tepu sepenuhnya).',
    'Sunlight reaching the ground': 'Cahaya matahari yang sampai ke tanah',
    'Solar energy arriving at the surface each day, after clouds and haze have taken their share.':
      'Tenaga suria yang tiba di permukaan setiap hari, selepas awan dan jerebu menyerap sebahagiannya.',
    'Cloud cover': 'Litupan awan', 'The share of the sky covered by cloud.': 'Bahagian langit yang dilitupi awan.',
    'Wind speed': 'Kelajuan angin', 'Average wind speed 10 metres above the ground.': 'Purata kelajuan angin 10 meter di atas tanah.',
    'Ozone layer thickness': 'Ketebalan lapisan ozon',
    'Total ozone in the air column above you, in Dobson units. Ozone blocks harmful ultraviolet light.':
      'Jumlah ozon dalam turus udara di atas anda, dalam unit Dobson. Ozon menghalang cahaya ultraungu yang berbahaya.',
    'Haze, smoke and dust': 'Jerebu, asap dan debu',
    'Aerosol optical depth: how much tiny particles in the air dim the light. Higher means hazier. Starts in 2001.':
      'Kedalaman optik aerosol: sejauh mana zarah halus di udara memalapkan cahaya. Lebih tinggi bermaksud lebih berjerebu. Bermula pada 2001.',

    // ---- places ----
    'the east coast of Peninsular Malaysia': 'pantai timur Semenanjung Malaysia', 'Klang Valley, Malaysia': 'Lembah Klang, Malaysia',
    'Penang, Malaysia': 'Pulau Pinang, Malaysia', 'the Sahel in Niger': 'Sahel di Niger', 'the central Amazon, Brazil': 'Amazon tengah, Brazil',
    'the Aral Sea region': 'kawasan Laut Aral', 'the Murray-Darling basin, Australia': 'lembangan Murray-Darling, Australia',
    'the Arctic coast of Alaska': 'pantai Artik Alaska', 'central Greenland': 'Greenland tengah',
    'Wisconsin, USA': 'Wisconsin, Amerika Syarikat',
    'Surface air pressure': 'Tekanan udara permukaan',
    'The weight of all the air above, pressing on the ground. It is lower on high ground and falls when storms pass.':
      'Berat semua udara di atas yang menekan tanah. Ia lebih rendah di tanah tinggi dan jatuh apabila ribut melintas.',

    // ---- wizard (moved here from wizard.js) ----
    'What kind of place?': 'Jenis tempat apa?',
    'What are you curious about?': 'Apa yang anda ingin tahu?',
    'Where exactly?': 'Di mana tepatnya?',
    'Try one of these': 'Cuba salah satu',
    'Example': 'Contoh',
    'The place I have open now': 'Tempat yang sedang dibuka',
    'I will click a place on the globe': 'Saya akan klik tempat pada glob',
    'Ask AI for more ideas': 'Tanya AI untuk idea lain',
    'Question {a} of 3': 'Soalan {a} daripada 3',
    'Close': 'Tutup',
    'Now click a place on the globe to test it.': 'Sekarang klik tempat pada glob untuk mengujinya.',
    'Not sure what to ask? Help me choose': 'Tidak pasti apa hendak ditanya? Bantu saya pilih',
    'A big city': 'Bandar besar',
    'A rainforest': 'Hutan hujan',
    'Borneo': 'Borneo',
    'A desert or dry land': 'Gurun atau tanah kering',
    'A coast or river mouth': 'Pantai atau muara sungai',
    'Mekong delta, Vietnam': 'Delta Mekong, Vietnam',
    'Farmland': 'Tanah ladang',
    'A cold or snowy place': 'Tempat sejuk atau bersalji',
    'The open sea': 'Laut terbuka',
    'South China Sea': 'Laut China Selatan',
    'Strait of Malacca': 'Selat Melaka',
    'Mountains': 'Pergunungan',
    'Tibetan Plateau': 'Dataran Tinggi Tibet',
    'Swiss Alps': 'Alps Switzerland',
    'Show me what matters most': 'Tunjukkan yang paling penting',
    'Is it getting hotter?': 'Adakah semakin panas?',
    'Wetter or drier?': 'Lebih basah atau kering?',
    'Air, haze and wind': 'Udara, jerebu dan angin',
    'Sun and clouds': 'Matahari dan awan',

    // ---- AI explainer (moved here from ai.js) ----
    'less than 1 time in 1,000': 'kurang daripada 1 kali dalam 1,000',
    'In short': 'Ringkasnya',
    'Is the change real?': 'Adakah perubahan ini benar?',
    'Trend vs. normal variation': 'Tren berbanding turun naik biasa',
    'Each year tends to look like the year before, which can make a trend look more certain than it is.': 'Setiap tahun cenderung menyerupai tahun sebelumnya, jadi tren mungkin kelihatan lebih pasti daripada sebenarnya.',
    'Be careful': 'Berhati-hati',
    'The two tests, in one line each': 'Dua ujian, satu ayat setiap satu',
    'Mann-Kendall asks: are later years mostly higher (or lower) than earlier ones? Sen’s slope is the typical change per year, worked out so that one freak year barely moves it.': 'Mann-Kendall bertanya: adakah tahun kemudian kebanyakannya lebih tinggi (atau rendah) daripada tahun awal? Cerun Sen ialah perubahan biasa setahun, dikira supaya satu tahun luar biasa hampir tidak menjejaskannya.',
    'Pick a place and a variable first, then I can explain the result.': 'Pilih tempat dan pemboleh ubah dahulu, kemudian saya boleh terangkan keputusannya.',
    'For free-form questions, add an OpenAI API key in the AI settings (⚙).': 'Untuk soalan bebas, masukkan kunci API OpenAI dalam tetapan AI (⚙).',
    'The API key was not accepted. Check it in the AI settings.': 'Kunci API tidak diterima. Semak dalam tetapan AI.',
    'OpenAI says the limit or quota is reached. Try again later or check your billing.': 'OpenAI menyatakan had atau kuota telah dicapai. Cuba lagi nanti atau semak bil anda.',
    'Explain this simply': 'Terangkan dengan mudah',
    'Ask AI a question →': 'Tanya AI →',
    'In plain words': 'Dalam bahasa mudah',
    'Get an AI explanation': 'Dapatkan penerangan AI',
    'This summary is built in and works offline. For a fuller AI explanation and free-form questions, add an OpenAI API key in the AI chat settings.': 'Ringkasan ini terbina dalam dan berfungsi luar talian. Untuk penerangan AI yang lebih lengkap, masukkan kunci API OpenAI dalam tetapan sembang AI.',
    'Thinking…': 'Sedang berfikir…',
    'Explain this result to a secondary-school student in 4 short bullet points: what changed, whether it is real, how big it is compared with normal variation, and one thing to be careful about.': 'Terangkan keputusan ini kepada pelajar sekolah menengah dalam 4 poin ringkas: apa yang berubah, sama ada ia benar, sebesar mana berbanding turun naik biasa, dan satu perkara yang perlu diberi perhatian.',
    'No key saved. I will use the built-in explainer.': 'Tiada kunci disimpan. Saya akan guna penerang terbina dalam.',
    'Key removed from this browser.': 'Kunci dibuang daripada pelayar ini.',
    'Ask AI': 'Tanya AI',
    'Trend Detective AI': 'AI Trend Detective',
    'built-in': 'terbina dalam',
    'AI settings': 'Tetapan AI',
    'OpenAI API key (optional)': 'Kunci API OpenAI (pilihan)',
    'Model': 'Model',
    'Stored only in this browser and sent only to OpenAI. Usage is billed to this key. Leave it empty to use the free built-in explainer.': 'Disimpan hanya dalam pelayar ini dan dihantar hanya kepada OpenAI. Penggunaan dicaj kepada kunci ini. Biarkan kosong untuk guna penerang terbina dalam yang percuma.',
    'Save': 'Simpan',
    'Remove key': 'Buang kunci',
    'Ask about this result…': 'Tanya tentang keputusan ini…',
    'Explain this result simply': 'Terangkan keputusan ini dengan mudah',
    'What does the p-value mean?': 'Apa maksud nilai p?',
    'Is this change big?': 'Adakah perubahan ini besar?',
    'Why might this be happening?': 'Mengapa ini berlaku?',
    'Hi! Pick a place and something to investigate, then ask me what the numbers mean.': 'Hai! Pilih tempat dan perkara untuk disiasat, kemudian tanya saya maksud nombornya.',
    'Stopped.': 'Dihentikan.',
    'Could not reach OpenAI.': 'Tidak dapat menghubungi OpenAI.',
    'Built-in answer instead:': 'Jawapan terbina dalam:',
    'The p-value is the chance of seeing a pattern this steady if nothing were really changing. Small means "unlikely to be luck". Below 0.05 (1 in 20) we call it statistically significant.': 'Nilai p ialah peluang melihat corak sekukuh ini jika tiada apa-apa yang benar-benar berubah. Nilai kecil bermaksud "tidak mungkin kebetulan". Di bawah 0.05 (1 dalam 20) dianggap signifikan secara statistik.',
    'The Mann-Kendall test compares every pair of years and counts how often the later year is higher. Tau runs from −1 (always falling) to +1 (always rising). It does not care how big the change is, only how consistent.': 'Ujian Mann-Kendall membandingkan setiap pasangan tahun dan mengira berapa kerap tahun kemudian lebih tinggi. Tau dari −1 (sentiasa turun) hingga +1 (sentiasa naik). Ia mengukur konsistensi, bukan saiz perubahan.',
    'Sen’s slope is the middle value of the slopes between every pair of years, so a single extreme year hardly affects it. We show it per decade (10 years) because yearly changes are tiny.': 'Cerun Sen ialah nilai tengah cerun antara setiap pasangan tahun, jadi satu tahun ekstrem hampir tidak menjejaskannya. Kami tunjukkan setiap dekad (10 tahun) kerana perubahan tahunan sangat kecil.',
    'A spike is a single year far from the trend line (for example a strong El Niño year). One spike can make a line tilt, so we re-test without it to see whether the trend survives.': 'Lonjakan ialah satu tahun yang jauh dari garis tren (contohnya tahun El Niño yang kuat). Kami uji semula tanpanya untuk melihat sama ada tren masih kekal.',
    'These tests show whether something changed, not why. Common drivers include global warming, land-use change (cities, deforestation), and natural cycles such as El Niño. Treat any cause as a hypothesis to check.': 'Ujian ini menunjukkan sama ada sesuatu berubah, bukan mengapa. Punca biasa termasuk pemanasan global, perubahan guna tanah (bandar, penebangan hutan) dan kitaran semula jadi seperti El Niño. Anggap sebarang punca sebagai hipotesis.',
    'R² is the share of the year-to-year differences that the straight trend line accounts for. Climate data is noisy, so even a real trend often explains only a small share.': 'R² ialah bahagian perbezaan dari tahun ke tahun yang dijelaskan oleh garis tren. Data iklim banyak hingar, jadi tren sebenar pun selalunya menjelaskan bahagian yang kecil sahaja.',
    'The numbers come from NASA POWER, which serves satellite and model data (such as MERRA-2 and CERES) for any point on Earth since the 1980s.': 'Nombor ini daripada NASA POWER, yang menyediakan data satelit dan model (seperti MERRA-2 dan CERES) untuk mana-mana titik di Bumi sejak 1980-an.',

    // ---- AI chat: safe answers ----
    'I could not read the numbers for this case. Try another place or period, then ask again.': 'Saya tidak dapat membaca nombor bagi kes ini. Cuba tempat atau tempoh lain, kemudian tanya semula.',
    'I can only answer questions about this result. Try: "Is the change real?", "How fast is it changing?" or "Why might it be changing?"': 'Saya hanya boleh menjawab soalan tentang keputusan ini. Cuba: "Adakah perubahan ini benar?", "Berapa cepat ia berubah?" atau "Kenapa ia mungkin berubah?"',
    'Sorry, something went wrong while answering. Please try another question.': 'Maaf, berlaku masalah semasa menjawab. Sila cuba soalan lain.',

    // ---- chart card: legend, hint, tooltip, table ----
    '95% confidence band': 'Jalur keyakinan 95%', 'Value': 'Nilai',
    'Drag across the chart to test only those years. Stripes: {lo} years were below the average, {hi} years above.':
      'Seret merentasi carta untuk menguji tahun-tahun itu sahaja. Jalur warna: tahun {lo} berada di bawah purata, tahun {hi} di atas purata.',
    'blue': 'biru', 'red': 'merah', 'brown': 'coklat', 'teal': 'hijau kebiruan',
    '{x} vs average': '{x} berbanding purata', '{x} on the trend line': '{x} pada garis tren',

    // ---- months panel, how to read this, footer ----
    'There is not enough monthly data here to test each month.':
      'Tidak cukup data bulanan di sini untuk menguji setiap bulan.',
    '<strong>{n} of {m}</strong> months show a significant trend. The biggest is <strong>{month}</strong>, rising by about {rate}.':
      '<strong>{n} daripada {m}</strong> bulan menunjukkan tren yang signifikan. Yang terbesar ialah <strong>{month}</strong>, meningkat kira-kira {rate}.',
    '<strong>{n} of {m}</strong> months show a significant trend. The biggest is <strong>{month}</strong>, falling by about {rate}.':
      '<strong>{n} daripada {m}</strong> bulan menunjukkan tren yang signifikan. Yang terbesar ialah <strong>{month}</strong>, menurun kira-kira {rate}.',
    'No single month shows a statistically significant trend here.':
      'Tiada satu bulan pun yang menunjukkan tren signifikan secara statistik di sini.',
    'Trend per decade for each month of the year':
      'Tren sedekad bagi setiap bulan dalam setahun',
    'not enough data':
      'data tidak mencukupi',
    'Mar':
      'Mac',
    'Aug':
      'Ogo',
    'Oct':
      'Okt',
    'Dec':
      'Dis',
    'Each bar is the trend for one month on its own, per decade. Solid bars are statistically significant, pale bars are not. Click a bar to investigate that month; click it again for the whole year.':
      'Setiap bar ialah tren bagi satu bulan secara berasingan, sedekad. Bar pekat signifikan secara statistik, bar pudar tidak. Klik bar untuk menyiasat bulan itu; klik sekali lagi untuk sepanjang tahun.',
    '<strong>Trend.</strong> A trend is a change that keeps going in one direction over many years. One hot year is weather. Thirty years that keep getting hotter is a trend.':
      '<strong>Tren.</strong> Tren ialah perubahan yang berterusan ke satu arah selama bertahun-tahun. Satu tahun yang panas ialah cuaca. Tiga puluh tahun yang terus semakin panas ialah tren.',
    '<strong>Significant.</strong> Every measurement wobbles from year to year, so a line through the points almost always tilts a little. A test asks: if nothing were really changing, how often would random wobble alone produce a tilt this clear? That chance is the p-value. When it is below 0.05 (1 in 20), scientists call the trend statistically significant.':
      '<strong>Signifikan.</strong> Setiap ukuran turun naik dari tahun ke tahun, jadi garis yang melalui titik-titik hampir sentiasa condong sedikit. Ujian bertanya: jika sebenarnya tiada apa-apa yang berubah, berapa kerap turun naik rawak sahaja akan menghasilkan kecondongan sejelas ini? Peluang itu ialah nilai-p. Apabila ia di bawah 0.05 (1 dalam 20), saintis menyebut tren itu signifikan secara statistik.',
    '<strong>Two tests.</strong> The t-test assumes the wobble follows a bell curve. The Mann-Kendall test only compares which years are higher than which, so odd years and skewed data do not fool it. This page uses Mann-Kendall for the verdict and shows the t-test beside it.':
      '<strong>Dua ujian.</strong> Ujian-t menganggap turun naik itu mengikut lengkung loceng. Ujian Mann-Kendall hanya membandingkan tahun mana yang lebih tinggi daripada yang lain, jadi tahun luar biasa dan data yang pencong tidak mengelirukannya. Halaman ini menggunakan Mann-Kendall untuk keputusan dan menunjukkan ujian-t di sebelahnya.',
    '<strong>Stripes.</strong> The coloured strip under the chart has one stripe per year, coloured by how far that year was above or below the average of the whole period.':
      '<strong>Jalur warna.</strong> Jalur berwarna di bawah carta mempunyai satu jalur bagi setiap tahun, diwarnakan mengikut sejauh mana tahun itu berada di atas atau di bawah purata keseluruhan tempoh.',
    '<strong>Not significant does not mean no change.</strong> It means the record is too short or too noisy to be sure yet.':
      '<strong>Tidak signifikan tidak bermaksud tiada perubahan.</strong> Ia bermaksud rekod itu masih terlalu pendek atau terlalu bising untuk dipastikan.',
    'Method':
      'Kaedah',
    'Privacy':
      'Privasi',
    'Third-party services':
      'Perkhidmatan pihak ketiga',
    'Accessibility':
      'Kebolehcapaian',
    'Licence and credits':
      'Lesen dan penghargaan',
    'NASA Prediction Of Worldwide Energy Resources (POWER) monthly API, NASA Langley Research Center. Temperature, rain, soil, wind, humidity and ozone come from the MERRA-2 reanalysis (NASA Global Modeling and Assimilation Office). Sunlight, cloud and aerosol values come from CERES SYN1deg and GEWEX SRB.':
      'API bulanan NASA Prediction Of Worldwide Energy Resources (POWER), NASA Langley Research Center. Suhu, hujan, tanah, angin, kelembapan dan ozon datang daripada analisis semula MERRA-2 (NASA Global Modeling and Assimilation Office). Nilai cahaya matahari, awan dan aerosol datang daripada CERES SYN1deg dan GEWEX SRB.',
    'Read the full methods, sources and limits':
      'Baca kaedah, sumber dan batasan penuh',
    'Monthly values are averaged into one value per year, and over the grid cells in the chosen area weighted by area. Trend: least-squares line with a t-test, Mann-Kendall test and Sen’s slope. Linear trends only.':
      'Nilai bulanan dipuratakan menjadi satu nilai setahun, dan merentasi sel grid dalam kawasan yang dipilih mengikut pemberat keluasan. Tren: garis kuasa dua terkecil dengan ujian-t, ujian Mann-Kendall dan kecerunan Sen. Tren linear sahaja.',
    'No accounts, no analytics and no cookies. Your choices live only in the page address. The light or dark theme you pick is remembered in your own browser’s storage and never leaves your device. The coordinates of the place you investigate are sent to NASA POWER to fetch the data; if you press “use my location”, that position is used the same way and is not stored by this app. The app handles no personal data under Malaysia’s Personal Data Protection Act 2010.':
      'Tiada akaun, tiada analitik dan tiada kuki. Pilihan anda hanya disimpan dalam alamat halaman. Tema cerah atau gelap yang anda pilih diingati dalam storan pelayar anda sendiri dan tidak pernah meninggalkan peranti anda. Koordinat tempat yang anda siasat dihantar kepada NASA POWER untuk mendapatkan data; jika anda menekan “gunakan lokasi saya”, kedudukan itu digunakan dengan cara yang sama dan tidak disimpan oleh aplikasi ini. Aplikasi ini tidak mengendalikan sebarang data peribadi di bawah Akta Perlindungan Data Peribadi 2010 Malaysia.',
    'Your browser connects to five outside services: NASA POWER (climate data), NASA GIBS (the satellite pictures on the globe and the live rain images), Google Fonts (typefaces, which means Google receives your IP address), cdnjs (the D3 charting library) and jsDelivr (the topojson-client library and Natural Earth map outlines from the world-atlas package). Each has its own privacy policy. The question box works entirely in your browser; nothing you type is sent anywhere. The AI helper’s plain-language summaries are also built in. Only if you paste your own OpenAI API key into the AI settings are your chat questions and the numbers of the current case sent to OpenAI; the key is stored only in your browser.':
      'Pelayar anda bersambung kepada lima perkhidmatan luar: NASA POWER (data iklim), NASA GIBS (gambar satelit pada glob dan imej hujan langsung), Google Fonts (fon, yang bermaksud Google menerima alamat IP anda), cdnjs (pustaka carta D3) dan jsDelivr (pustaka topojson-client dan garis peta Natural Earth daripada pakej world-atlas). Setiap satunya mempunyai dasar privasi sendiri. Kotak soalan berfungsi sepenuhnya dalam pelayar anda; tiada apa yang anda taip dihantar ke mana-mana. Ringkasan bahasa mudah oleh pembantu AI juga terbina dalam. Hanya jika anda menampal kunci API OpenAI anda sendiri ke dalam tetapan AI, barulah soalan sembang anda dan nombor kes semasa dihantar kepada OpenAI; kunci itu disimpan hanya dalam pelayar anda.',
    'Light and dark themes, a phone layout, a table view of every chart and keyboard control throughout. The globe spins with the arrow keys and Enter chooses the place in the centre; the latitude and longitude boxes do the same job.':
      'Tema cerah dan gelap, susun atur telefon, paparan jadual bagi setiap carta dan kawalan papan kekunci di seluruh halaman. Glob berputar dengan kekunci anak panah dan Enter memilih tempat di tengah; kotak latitud dan longitud melakukan tugas yang sama.',
    'Code under the Apache License 2.0. Map outlines from Natural Earth (public domain). Type: SF Pro, the system font on Apple devices, with Inter (SIL Open Font License) on other devices. No NASA logo or insignia is used.':
      'Kod di bawah Lesen Apache 2.0. Garis peta daripada Natural Earth (domain awam). Fon: SF Pro, fon sistem pada peranti Apple, dengan Inter (SIL Open Font License) pada peranti lain. Tiada logo atau lambang NASA digunakan.',
    'Contact:':
      'Hubungi:',
    'through the':
      'melalui',
    'project repository':
      'repositori projek',

    // ---- months panel: bar tooltip ----
    'Not enough data': 'Data tidak mencukupi',
    'Click to go back to the whole year': 'Klik untuk kembali ke sepanjang tahun',
    'Click to investigate this month': 'Klik untuk menyiasat bulan ini',

    // ---- months ----
    'Whole year': 'Sepanjang tahun', 'January': 'Januari', 'February': 'Februari', 'March': 'Mac', 'May': 'Mei', 'June': 'Jun',
    'July': 'Julai', 'August': 'Ogos', 'October': 'Oktober', 'December': 'Disember',
    'Seasons': 'Musim', 'One month': 'Satu bulan',
    'June to August': 'Jun hingga Ogos', 'September to November': 'September hingga November',
    'December to February': 'Disember hingga Februari', 'March to May': 'Mac hingga Mei'
  };

  var lang = 'en';
  try { if (localStorage.getItem('td-lang') === 'bm') lang = 'bm'; } catch (e) { /* storage blocked */ }

  function norm(s) { return String(s).replace(/\s+/g, ' ').trim(); }
  function tr(s) {
    if (lang !== 'bm') return s;
    return BM[s] || BM[norm(s)] || s;
  }

  function applyPage() {
    document.documentElement.lang = lang === 'bm' ? 'ms' : 'en';
    Array.prototype.forEach.call(document.querySelectorAll('[data-i18n]'), function (el) {
      if (el.dataset.en === undefined) el.dataset.en = el.innerHTML;
      el.innerHTML = lang === 'bm' ? (BM[norm(el.dataset.en)] || el.dataset.en) : el.dataset.en;
    });
    Array.prototype.forEach.call(document.querySelectorAll('[data-i18n-placeholder]'), function (el) {
      if (el.dataset.enPh === undefined) el.dataset.enPh = el.placeholder;
      el.placeholder = tr(el.dataset.enPh);
    });
    var b = document.getElementById('lang');
    if (b) {
      b.textContent = lang === 'bm' ? 'EN' : 'BM';
      b.setAttribute('aria-label', lang === 'bm' ? 'Switch to English' : 'Tukar ke Bahasa Malaysia');
      b.title = b.getAttribute('aria-label');
    }
  }

  function set(l) {
    lang = l === 'bm' ? 'bm' : 'en';
    try { localStorage.setItem('td-lang', lang); } catch (e) { /* storage blocked */ }
    applyPage();
    if (window.TD) window.TD.rerender();
    document.dispatchEvent(new CustomEvent('td:lang', { detail: lang }));
  }

  window.TDi18n = { tr: tr, set: set, get lang() { return lang; }, dict: BM };

  function init() {
    applyPage();
    if (lang === 'bm' && window.TD) window.TD.rerender();
    var b = document.getElementById('lang');
    if (b) b.addEventListener('click', function () { set(lang === 'bm' ? 'en' : 'bm'); });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();