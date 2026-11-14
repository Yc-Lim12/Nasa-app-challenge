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
