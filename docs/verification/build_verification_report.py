from pathlib import Path
import sys
sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "tmp" / "pdfs" / "lib"))
from html import escape
from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import mm
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, PageBreak, Flowable, KeepTogether, Image
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont

pdfmetrics.registerFont(TTFont("MicrosoftYaHei", r"C:\Windows\Fonts\msyh.ttc", subfontIndex=0))

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "output" / "pdf" / "trend-detective-weekend-verification.pdf"
OUT.parent.mkdir(parents=True, exist_ok=True)
BLUE = colors.HexColor("#1769aa")
DARK = colors.HexColor("#19324a")
PALE = colors.HexColor("#eef6fc")
RED = colors.HexColor("#a44032")
GREEN = colors.HexColor("#246b45")

styles = getSampleStyleSheet()
styles.add(ParagraphStyle(name="TitleCustom", parent=styles["Title"], fontName="Helvetica-Bold", fontSize=22, leading=26, textColor=DARK, alignment=TA_CENTER, spaceAfter=5))
styles.add(ParagraphStyle(name="Sub", parent=styles["Normal"], fontSize=9, leading=12, textColor=colors.HexColor("#53687a"), alignment=TA_CENTER, spaceAfter=12))
styles.add(ParagraphStyle(name="H1x", parent=styles["Heading1"], fontName="Helvetica-Bold", fontSize=15, leading=18, textColor=DARK, spaceBefore=4, spaceAfter=7))
styles.add(ParagraphStyle(name="H2x", parent=styles["Heading2"], fontName="Helvetica-Bold", fontSize=10, leading=13, textColor=BLUE, spaceBefore=7, spaceAfter=4))
styles.add(ParagraphStyle(name="Bodyx", parent=styles["BodyText"], fontSize=8.7, leading=12, spaceAfter=6))
styles.add(ParagraphStyle(name="Chinese", parent=styles["BodyText"], fontName="MicrosoftYaHei", fontSize=8.7, leading=14, spaceAfter=6))
styles.add(ParagraphStyle(name="Smallx", parent=styles["BodyText"], fontSize=7.4, leading=9.6, spaceAfter=2))
styles.add(ParagraphStyle(name="Tinyx", parent=styles["BodyText"], fontSize=6.7, leading=8.2, spaceAfter=0))
styles.add(ParagraphStyle(name="HeaderTinyx", parent=styles["BodyText"], fontName="Helvetica-Bold", fontSize=6.7, leading=8.4, textColor=colors.white, spaceAfter=0))
styles.add(ParagraphStyle(name="HeaderLightx", parent=styles["BodyText"], fontName="Helvetica-Bold", fontSize=7.3, leading=9, textColor=DARK, spaceAfter=0))
styles.add(ParagraphStyle(name="Boxx", parent=styles["BodyText"], fontSize=8.4, leading=11.5, leftIndent=5, rightIndent=5, spaceAfter=2))


def P(text, style="Bodyx"):
    return Paragraph(text, styles[style])


def link(url, label):
    return f'<link href="{escape(url, quote=True)}" color="#1769aa">{escape(label)}</link>'


class FlowDiagram(Flowable):
    def __init__(self):
        super().__init__()
        self.height = 92

    def wrap(self, availWidth, availHeight):
        self.width = availWidth
        return availWidth, self.height

    def draw(self):
        c = self.canv
        n, gap = 5, 13
        bw = (self.width - (n - 1) * gap) / n
        bh, y = 62, 17
        labels = [
            "Choose variable,<br/>place and period",
            "Request monthly<br/>NASA POWER values<br/>in the browser",
            "Skip -999; average<br/>valid months by year",
            "Calculate trend,<br/>Mann-Kendall<br/>and t-test",
            "Show chart, 95% band<br/>and plain-language<br/>result",
        ]
        for i, label in enumerate(labels):
            x = i * (bw + gap)
            c.setFillColor(PALE if i != 4 else colors.HexColor("#e8f4eb"))
            c.setStrokeColor(BLUE if i != 4 else GREEN)
            c.roundRect(x, y, bw, bh, 6, stroke=1, fill=1)
            p = Paragraph(label, ParagraphStyle("flow", fontName="Helvetica", fontSize=7.3, leading=9, alignment=TA_CENTER, textColor=DARK))
            tw, th = p.wrap(bw - 8, bh - 8)
            p.drawOn(c, x + (bw - tw) / 2, y + (bh - th) / 2)
            if i < n - 1:
                ax = x + bw + 2
                end = ax + gap - 4
                mid = y + bh / 2
                c.setStrokeColor(BLUE); c.setFillColor(BLUE)
                c.line(ax, mid, end, mid)
                c.line(end, mid, end - 3, mid + 2)
                c.line(end, mid, end - 3, mid - 2)


def footer(canvas, doc):
    canvas.saveState()
    canvas.setStrokeColor(colors.HexColor("#d5e0e9"))
    canvas.line(19*mm, 14*mm, A4[0] - 19*mm, 14*mm)
    canvas.setFont("Helvetica", 7)
    canvas.setFillColor(colors.HexColor("#667788"))
    canvas.drawString(19*mm, 9*mm, "Trend Detective | NASA Space Apps Challenge 2026 | Browser checks on 14 Nov 2026")
    canvas.drawRightString(A4[0] - 19*mm, 9*mm, f"Page {doc.page}")
    canvas.restoreState()


def cell(text, style="Tinyx"):
    return P(escape(str(text)), style)

story = []
story += [P("Trend Detective", "TitleCustom"), P("NASA Space Apps Challenge 2026: Be An Earth System Trend Detective! | Kuala Lumpur | 14 November 2026", "Sub")]
story.append(P("What was checked", "H1x"))
story.append(P("The BM interface now translates the NASA POWER loading and short-record messages, the scan table, its statistical summary and multiple-testing explanation. Browser checks covered polar locations, open ocean, the date line, the late-starting haze record and a five-year record. Three Malaysian temperature records were compared with direct NASA POWER CSV downloads, and a 45-year MERRA-2 series was cross-checked against NASA POWER at Giovanni's reported grid point.", "Bodyx"))
story.append(P("Data flow", "H1x"))
story.append(FlowDiagram())
story.append(P("English narration", "H2x"))
story.append(P("A student chooses a variable, place and period. The browser requests NASA POWER monthly values, skips -999 missing values and averages the valid months into yearly values. Trend Detective calculates the linear rate, Sen's slope, Mann-Kendall test and slope t-test, then displays the chart, 95% confidence band and a plain-language explanation. All calculations run in the browser; there is no app server.", "Bodyx"))
story.append(P("中文说明", "H2x"))
story.append(P("学生选择变量、地点和时间范围后，浏览器直接向 NASA POWER 获取月度数据。程序跳过 -999 缺失值，把有效月份计算成年平均值，再计算线性趋势、Sen 斜率、Mann-Kendall 检验和斜率 t 检验。页面显示图表、95% 置信区间和通俗说明。计算在浏览器内完成，不需要应用服务器。", "Chinese"))
story.append(P("BM ringkas", "H2x"))
story.append(P("Pengguna memilih pemboleh ubah, tempat dan tempoh. Pelayar mendapatkan data bulanan NASA POWER, mengetepikan nilai hilang -999, mengira purata tahunan dan ujian tren, kemudian memaparkan carta, julat keyakinan 95% dan penerangan bahasa mudah. Semua pengiraan berjalan dalam pelayar tanpa pelayan aplikasi.", "Bodyx"))
story.append(Spacer(1, 3))
story.append(P("Methods note: the app reports Mann-Kendall, Sen's slope and a slope t-test. It warns when year-to-year autocorrelation is strong; its p-values are not autocorrelation-corrected, so interpret those cases cautiously.", "Smallx"))

story.append(PageBreak())
story.append(P("Browser edge-case checks", "H1x"))
story.append(P("Manual checks on the live local index.html page and NASA POWER API. PASS means the page gave a valid result or a clear expected warning. WARN marks questionable source coverage. RESTORED records the requested rollback; the short-record stale-result behavior was not re-tested after the rollback.", "Bodyx"))
edge_rows = [
    [P("Case", "HeaderTinyx"), P("Inputs", "HeaderTinyx"), P("Observed result", "HeaderTinyx"), P("Status", "HeaderTinyx")],
    [cell("North Pole"), cell("89°N; T2M; 1981-2025"), cell("Loads; +0.60 °C/decade, Mann-Kendall p < 0.001."), cell("PASS")],
    [cell("South Pole"), cell("89°S; T2M; 1981-2025"), cell("Loads; +0.48 °C/decade, p < 0.001."), cell("PASS")],
    [cell("Open ocean"), cell("0°N, 140°W; GWETTOP; 1981-2025"), cell("App reports no trend; source returns 1.0 every month at this ocean point."), P("WARN", "Tinyx")],
    [cell("Date line"), cell("0°N; 179°E and 179°W; T2M; 2° box"), cell("Both sides load; about +0.18 and +0.17 °C/decade."), cell("PASS")],
    [cell("Haze / aerosols"), cell("Klang point; AOD_55; requested 1981-2025"), cell("25 annual rows, 2001-2025; source metadata says starts in 2001."), cell("PASS")],
    [cell("Short record"), cell("Klang point; T2M; 2021-2025"), cell("BM warning is translated. Original stale-results behavior was restored at the user's request, so a previous result can remain visible."), cell("RESTORED")],
    [cell("BM scan"), cell("Klang point; scan 18 variables"), cell("Summary, table headers and false-alarm explanation are in BM."), cell("PASS")],
]
t = Table(edge_rows, colWidths=[70, 119, 235, 52], repeatRows=1, hAlign="LEFT")
t.setStyle(TableStyle([
    ("BACKGROUND", (0,0), (-1,0), colors.HexColor("#1f4f76")),
    ("GRID", (0,0), (-1,-1), 0.35, colors.HexColor("#cad6df")),
    ("VALIGN", (0,0), (-1,-1), "TOP"), ("LEFTPADDING", (0,0), (-1,-1), 4),
    ("RIGHTPADDING", (0,0), (-1,-1), 4), ("TOPPADDING", (0,0), (-1,-1), 4),
    ("BOTTOMPADDING", (0,0), (-1,-1), 4), ("BACKGROUND", (0,2), (-1,2), colors.HexColor("#eef4f8")),
    ("BACKGROUND", (0,4), (-1,4), colors.HexColor("#eef4f8")), ("BACKGROUND", (0,6), (-1,6), colors.HexColor("#eef4f8")),
    ("TEXTCOLOR", (3,1), (3,-1), GREEN), ("TEXTCOLOR", (3,3), (3,3), RED),
]))
story.append(t)
story.append(Spacer(1, 10))
issue_box = Table([[P("Issue for Danny - open-ocean soil wetness", "H2x")], [P("At 0°N, 140°W, NASA POWER supplies topsoil wetness (GWETTOP) = 1.0 for every month. Trend Detective treats it as valid and reports a flat/no-trend result. That is not meaningful soil-moisture information over ocean. Suggested action: apply a land/valid-data mask for soil variables or show “no land data here.” A ready-to-forward reproduction note is saved as docs/verification/danny-issue.md.", "Boxx")]], colWidths=[494])
issue_box.setStyle(TableStyle([("BACKGROUND", (0,0), (-1,-1), colors.HexColor("#fff4f0")), ("BOX", (0,0), (-1,-1), 0.6, colors.HexColor("#d99a8e")), ("LEFTPADDING", (0,0), (-1,-1), 8), ("RIGHTPADDING", (0,0), (-1,-1), 8), ("TOPPADDING", (0,0), (-1,-1), 5), ("BOTTOMPADDING", (0,0), (-1,-1), 5)]))
story.append(issue_box)
story.append(Spacer(1, 8))
story.append(P("The issue note is prepared, but not sent: no Danny contact or team messaging channel was identified in this workspace.", "Smallx"))

story.append(PageBreak())
story.append(P("NASA POWER data check", "H1x"))
story.append(P("We downloaded the official monthly point CSV for each site and opened the same point/year case in Trend Detective. The app computes an annual mean from the twelve monthly values. Sample values below are shown to 0.01 °C.", "Bodyx"))
comparison = [
    [P("Site / year", "HeaderTinyx"), P("POWER 12-month mean", "HeaderTinyx"), P("POWER ANN", "HeaderTinyx"), P("App", "HeaderTinyx"), P("App - month", "HeaderTinyx"), P("App - ANN", "HeaderTinyx")],
    [cell("Klang 1981"), cell("25.18"), cell("25.18"), cell("25.18"), cell("0.00"), cell("0.00")],
    [cell("Klang 2000"), cell("25.17"), cell("25.17"), cell("25.17"), cell("0.00"), cell("0.00")],
    [cell("Klang 2025"), cell("25.68"), cell("25.68"), cell("25.68"), cell("0.00"), cell("0.00")],
    [cell("Penang 1981"), cell("25.76"), cell("25.76"), cell("25.76"), cell("0.00"), cell("0.00")],
    [cell("Penang 2000"), cell("25.80"), cell("25.80"), cell("25.80"), cell("0.00"), cell("0.00")],
    [cell("Penang 2025"), cell("26.49"), cell("26.50"), cell("26.49"), cell("0.00"), cell("-0.01")],
    [cell("East Coast 1981"), cell("25.11"), cell("25.12"), cell("25.11"), cell("0.00"), cell("-0.01")],
    [cell("East Coast 2000"), cell("25.15"), cell("25.15"), cell("25.15"), cell("0.00"), cell("0.00")],
    [cell("East Coast 2025"), cell("25.69"), cell("25.69"), cell("25.69"), cell("0.00"), cell("0.00")],
]
t = Table(comparison, colWidths=[96, 98, 70, 48, 81, 82], repeatRows=1, hAlign="LEFT")
t.setStyle(TableStyle([
    ("BACKGROUND", (0,0), (-1,0), colors.HexColor("#1f4f76")),
    ("GRID", (0,0), (-1,-1), 0.35, colors.HexColor("#cad6df")), ("VALIGN", (0,0), (-1,-1), "MIDDLE"),
    ("ALIGN", (1,1), (-1,-1), "CENTER"), ("LEFTPADDING", (0,0), (-1,-1), 4),
    ("RIGHTPADDING", (0,0), (-1,-1), 4), ("TOPPADDING", (0,0), (-1,-1), 4),
    ("BOTTOMPADDING", (0,0), (-1,-1), 4), ("BACKGROUND", (0,2), (-1,2), colors.HexColor("#eef4f8")),
    ("BACKGROUND", (0,4), (-1,4), colors.HexColor("#eef4f8")), ("BACKGROUND", (0,6), (-1,6), colors.HexColor("#eef4f8")),
    ("BACKGROUND", (0,8), (-1,8), colors.HexColor("#eef4f8")),
]))
story.append(t)
story.append(Spacer(1, 6))
story.append(P("Result: all 9 app values match the mean of NASA POWER's 12 downloaded monthly values at the app's 0.01 °C display precision. Two values differ from the separate POWER ANN field by only 0.01 °C. NASA documents annual values as an aggregation of monthly values; monthly CSV values are rounded for display, so the annual column can differ by one last-place digit.", "Bodyx"))
story.append(P("Direct monthly CSV downloads", "H2x"))
urls = [
    ("Klang Valley (3.1 N, 101.6 E)", "https://power.larc.nasa.gov/api/temporal/monthly/point?parameters=T2M&community=AG&longitude=101.6&latitude=3.1&start=1981&end=2025&format=CSV"),
    ("Penang (5.35 N, 100.4 E)", "https://power.larc.nasa.gov/api/temporal/monthly/point?parameters=T2M&community=AG&longitude=100.4&latitude=5.35&start=1981&end=2025&format=CSV"),
    ("East Coast (5.4 N, 102.6 E)", "https://power.larc.nasa.gov/api/temporal/monthly/point?parameters=T2M&community=AG&longitude=102.6&latitude=5.4&start=1981&end=2025&format=CSV"),
]
for name, url in urls:
    story.append(P(f"• {link(url, name)} - raw downloaded file saved in docs/verification/.", "Smallx"))
story.append(P(f"POWER methods: {link('https://power.larc.nasa.gov/docs/services/api/temporal/monthly/', 'Monthly API documentation')} · {link('https://power.larc.nasa.gov/docs/methodology/data/processing/', 'monthly-to-annual processing')}", "Smallx"))

story.append(PageBreak())
story.append(P("Independent Giovanni cross-check", "H1x"))
story.append(P("Authenticated Giovanni v4.40 produced a monthly MERRA-2 2-meter air temperature series (M2IMNXASM_5_12_4_T2M) for January 1981 through December 2025. The selected bounds were 101.25°E-101.875°E, 3.0°N-3.5°N; Giovanni identifies the effective data grid as one point at 101.25°E, 3.0°N.", "Bodyx"))
giovanni_comparison = [
    [P("Annual summary", "HeaderLightx"), P("Giovanni (°C)", "HeaderLightx"), P("NASA POWER (°C)", "HeaderLightx"), P("Difference (°C)", "HeaderLightx")],
    [cell("1981 mean"), cell("27.535338"), cell("27.536667"), cell("-0.001328")],
    [cell("2000 mean"), cell("27.461013"), cell("27.464167"), cell("-0.003154")],
    [cell("2025 mean"), cell("28.157429"), cell("28.160000"), cell("-0.002571")],
    [cell("OLS trend / decade"), cell("+0.186268"), cell("+0.186135"), cell("+0.000133")],
]
gt = Table(giovanni_comparison, colWidths=[122, 114, 130, 115], repeatRows=1, hAlign="LEFT")
gt.setStyle(TableStyle([
    ("BACKGROUND", (0,0), (-1,0), colors.HexColor("#dcecf8")),
    ("GRID", (0,0), (-1,-1), 0.45, colors.HexColor("#b9cad8")),
    ("VALIGN", (0,0), (-1,-1), "MIDDLE"),
    ("ALIGN", (1,1), (-1,-1), "CENTER"), ("ALIGN", (0,1), (0,-1), "LEFT"),
    ("LEFTPADDING", (0,0), (-1,-1), 6), ("RIGHTPADDING", (0,0), (-1,-1), 6),
    ("TOPPADDING", (0,0), (-1,-1), 5), ("BOTTOMPADDING", (0,0), (-1,-1), 5),
    ("BACKGROUND", (0,2), (-1,2), colors.HexColor("#f2f7fb")),
    ("BACKGROUND", (0,4), (-1,4), colors.HexColor("#e8f4eb")),
]))
story.append(gt)
story.append(Spacer(1, 6))
story.append(P("We compared all 540 overlapping monthly values with NASA POWER at the same grid point. Giovanni values were converted from K to °C; the monthly mean absolute difference is 0.0069 °C (maximum 0.0343 °C). After averaging each year’s 12 months, the annual mean absolute difference is 0.0025 °C. The OLS slopes were calculated independently from those annual means; the Giovanni plot itself is a monthly series and does not display a trend test.", "Bodyx"))
story.append(P("This is a same-grid cross-check of the NASA data path. The earlier Trend Detective Klang Valley spot check used 3.1°N, 101.6°E, which differs from Giovanni’s effective point (3.0°N, 101.25°E); do not compare those separate locations as if they were the same point.", "Smallx"))
story.append(Spacer(1, 4))
plot = Image(str(ROOT / "docs" / "verification" / "assets" / "giovanni-kl-m2t2-1981-2025.png"), width=172*mm, height=65.6*mm)
story.append(plot)
story.append(P("Giovanni-generated plot: monthly 2-meter temperature in K, 1981-2025. The caption identifies the selected bounds and the single effective data-grid point.", "Smallx"))
story.append(Spacer(1, 3))
story.append(P(f"Reproduce: {link('https://giovanni.gsfc.nasa.gov/giovanni/#service=ArAvTs&starttime=1981-01-01T00:00:00Z&endtime=2025-12-31T23:59:59Z&bbox=101.25,3,101.875,3.5&data=M2IMNXASM_5_12_4_T2M&dataKeyword=2-meter%20air%20temperature', 'Giovanni selection')} · {link('https://power.larc.nasa.gov/api/temporal/monthly/point?parameters=T2M&community=AG&longitude=101.25&latitude=3&start=1981&end=2025&format=CSV', 'same-grid NASA POWER CSV')} · {link('https://disc.gsfc.nasa.gov/datacollection/M2IMNXASM_5.12.4.html', 'MERRA-2 product')} · {link('https://giovanni.gsfc.nasa.gov/giovanni/doc/UsersManualworkingdocument.docx.html', 'Giovanni User Guide')}.", "Smallx"))


doc = SimpleDocTemplate(str(OUT), pagesize=A4, rightMargin=19*mm, leftMargin=19*mm, topMargin=17*mm, bottomMargin=19*mm, title="Trend Detective Weekend Verification", author="Team Sunway to the Moon")
doc.build(story, onFirstPage=footer, onLaterPages=footer)
print(OUT)

