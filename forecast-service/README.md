# ☕ Coffee Forecast — dự đoán giá cà phê

Website dự đoán giá cà phê, lấy dữ liệu tự động, huấn luyện mô hình học máy, có
**chọn vùng** (Đắk Lắk, Lâm Đồng, Gia Lai, Đắk Nông) và **hai chuỗi dự báo độc lập**:

- **Robusta (giá Việt Nam, đ/kg)** — đúng loại cà phê Việt Nam trồng và bán.
- **Arabica ICE (giá thế giới, ¢/lb)** — chỉ để tham chiếu thị trường quốc tế.

## Đang chạy ở đâu

| | |
|---|---|
| Công khai | https://hermesttn.duckdns.org/coffee/ |
| Máy chủ | VPS `150.136.248.214` (`vps12g1`), user `ubuntu` |
| Thư mục trên VPS | `~/coffee-forecast` |
| Cổng nội bộ | `127.0.0.1:8002` (waitress) |
| Service | `coffee-forecast.service` (systemd) |
| Cập nhật tự động | `coffee-update.timer` — 02:00 UTC (09:00 giờ VN) mỗi ngày |
| Chạy local | `python app.py --port 8002` → http://127.0.0.1:8002/ |

## Nguồn dữ liệu và chất lượng từng nguồn

Đây là phần quan trọng nhất: **mỗi con số độ chính xác chỉ áp dụng cho đúng chuỗi của nó.**

| Nguồn | Loại | Tần suất | Độ phủ | Đã kiểm chứng |
|---|---|---|---|---|
| Arabica ICE futures (`KC=F`) — Yahoo Finance | chuỗi giá | ngày | 2.514 điểm, 2016-10 → nay | đối chiếu World Bank: tương quan **0,993** mức giá / **0,973** % thay đổi |
| USD/VND — Yahoo Finance | tỷ giá | ngày | 2.603 điểm | — |
| Robusta (ICO) — World Bank Pink Sheet | chuỗi giá | tháng | 801 điểm, **1960-01 → nay** | nguồn chính thức, tự động lấy link mới mỗi tháng |
| Giá toàn quốc — giacaphe.com | chuỗi tham khảo | ngày | như ghi trong `vn_domestic.csv` | một số ngày có thể không phản ánh tỉnh cụ thể |
| Giá Đắk Lắk + ba tỉnh — Nông Dân Việt | Robusta nhân xô, theo tỉnh | ngày | 131 mốc, 2026-06-11 → 2026-10-20 (ban đầu) | chỉ mốc 2026-09-23 → 2026-10-20 là holdout độc lập trong thử nghiệm hiện tại |
| Lịch sử giá VN — Wayback Machine | bổ sung quá khứ | ~ngày | backfill từ 2011 (`backfill_vn.py`) | chưa đủ để đo độ chính xác |



### Phân biệt hai mục tiêu dữ liệu Robusta (không gộp nhãn)

- **Đắk Lắk — VNCoffeePrice Mendeley v3:** `data/vnc_official_dak_lak_daily.csv` là bộ đa nguồn công khai, giấy phép khai báo CC BY 4.0, 1.613 mốc 2020-01-01–2026-05-22. Tuy nhiên README của tác giả nói nguồn gốc ban đầu của giá nội địa cần xác minh độc lập; không dùng làm giá tham chiếu live hay nhập chung các chuỗi khác. Backtest riêng được gắn nhãn exploratory vì test 2026 đã công khai.

- **Đắk Lắk theo tỉnh — Nông Dân Việt:** `data/region_dak-lak.csv`, cập nhật hằng ngày từ [bảng lịch sử Nông Dân Việt](https://nongdanviet.vn/gia-ca-phe/dak-lak). Khi nhập lần đầu có 131 mốc từ 11/06/2026 đến 20/10/2026; giá tham khảo theo tỉnh, không đại diện từng đại lý.
- **Đắk Lắk theo tỉnh — Giacaphe.com/Y5Cafe:** `data/giacaphe_dak_lak_daily.csv`, collected only from archive pages whose canonical URL and H1 confirm the same date, with CSS provincial prices. The publisher says its reference combines two global futures with business/agent surveys; it is not a dealer quote and depends partly on ICE. A short scrape currently exposes only 13 Dak Lak dated quotes from 2026-10-06 through 2026-10-20; no per-quote publication time or explicit reuse license is verified. Do not treat a headline/check date as observation date, merge this source, or use it for a forecasting claim.
- **Đắk Lắk theo tỉnh — Thị Trường Cà Phê:** `data/thitruongcaphe_daily.csv`, [API lịch sử theo ngày](https://thitruongcaphe.vn/api/prices/history) và [phương pháp](https://thitruongcaphe.vn/phuong-phap). Có 97 mốc từ 16/07/2026 đến 20/10/2026 lúc nhập đầu; website nói giá là trung vị nhiều nguồn, không phải báo giá một đại lý. Không tìm thấy giấy phép tái sử dụng rõ ràng nên giữ credit.
- Hai nguồn được lưu riêng, không gộp. Cutoff backtest đóng băng trước 01/10/2026; quote lặp đã bỏ khỏi số mẫu chấm để không tính cuối tuần/giá giữ nguyên thành dự báo đúng. Holdout riêng 01–30/09/2026; validation kết thúc trước 01/09. Nguồn Thị Trường Cà Phê còn 32 mốc giá đổi trước holdout nên chưa đủ tối thiểu 48 train+validation; chưa chấm accuracy. Nguồn Nông Dân Việt: 67 mốc độc lập trước holdout; chưa ứng viên nào qua tiêu chí validation, do đó **không triển khai tín hiệu hướng giá**.
- **Robusta Việt Nam toàn quốc:** `data/vn_robusta_daily_official.csv`, chuỗi 1.672 quan sát từ 01/01/2020 đến 02/10/2026, series 31267 của Trung tâm Thông tin (Bộ NN&MT), truy xuất qua API công khai của Dữ Liệu Kinh Tế. Đây là benchmark toàn quốc, **không phải giá Đắk Lắk** và nguồn hiện trễ so với ngày hiện tại.
- `official_robusta_daily.py` đồng bộ chuỗi trên; `backtest_official_daily.py` chạy kiểm định theo thời gian, feature lag-return/momentum/volatility/mùa vụ và so sánh Ridge, HistGradientBoosting, ExtraTrees với baseline giữ nguyên giá. Chia theo thời gian 60% train / 20% validation / 20% holdout; refit cuốn chiếu mỗi 10 quan sát. Holdout không dùng để chọn mô hình.
- Kết quả holdout hiện tại: Ridge được chọn trên validation đạt **79,33% trong biên ±2%**, nhưng persistence đạt **81,16% trong biên ±2%**; MAE lần lượt khoảng **1.413** và **1.377 đ/kg**, nên Ridge thua baseline **2,59% skill**. Đúng hướng khi Ridge gọi tăng/giảm là **51,72%**, không phải 79,33%. Kết quả này là backtest toàn quốc đến 02/10, không phải độ chính xác dự báo Đắk Lắk/live.
- Mục “Huấn luyện & kiểm định” trên web trình bày riêng độ gần giá, baseline và độ đúng hướng. Không gọi tỷ lệ trong ±2% là xác suất dự báo đúng.
- Nghiên cứu Mai, Shakur & Cassells (2018) nêu bộ giá farmgate Đắk Lắk và giá xuất khẩu theo ngày 06/2011–12/2015, nhưng file supplementary ZIP chưa tải được từ publisher/mirror trong lần kiểm tra này. Không tự tái tạo/điền các giá trị đó; nếu có quyền truy cập bài và dữ liệu gốc, có thể nhập sau khi xác minh metadata/licence.
- Backtest Đắk Lắk hiện dùng cutoff cố định **01/10/2026**, tách hẳn train / validation / holdout theo thời gian, chỉ chấm các lần giá đổi và mỗi dự báo holdout chỉ dùng các giá đã thấy trước đó. Nông Dân Việt: 67 mốc đổi giá trước holdout, 19 mốc holdout; ứng viên không qua validation nên deployed method là persistence (benchmark, không phát tín hiệu). Thị Trường Cà Phê: 32 mốc đổi trước holdout, chưa đủ tối thiểu 48 để chấm; không công bố accuracy cho nguồn này. Các nguồn được refresh riêng; báo cáo cutoff cũ không bị viết lại bằng dữ liệu mới.

### Vì sao thêm Robusta

Việt Nam bán **Robusta**, không phải Arabica. Nếu dùng Arabica làm proxy cho Robusta
(đo trên 801 tháng, 1960–2026):

| Chỉ số | Kết quả |
|---|---|
| Tương quan % thay đổi Arabica ↔ Robusta | 0,75 |
| Lệch trung bình mỗi tháng | 3,61 điểm % |
| Lệch khi nhìn 12 tháng | 16,7 điểm % |
| Tỷ lệ Arabica/Robusta | trung bình 1,55, dao động 0,93–2,92 |

→ Arabica là proxy **tồi** cho giá Việt Nam, nên web dùng Robusta làm gốc cho chuỗi đ/kg.

### Quy đổi ra đ/kg Việt Nam

```
giá VN (đ/kg) = giá Robusta (USD/kg) × tỷ giá USD/VND × hệ số VN/Robusta
```

Hệ số VN/Robusta được ước lượng từ chính dữ liệu giá VN đã thu thập (trung vị các quan
sát trong 36 tháng gần nhất; nếu chưa đủ mẫu thì dùng quan sát mới nhất).
Hệ số này **thay đổi theo thời gian** — ví dụ 2011 ≈ 0,78 còn 2026 ≈ 0,98 — nên số mẫu
hiện có được ghi rõ ngay trên web.

## Cách hoạt động

1. **Lấy dữ liệu** (`fetch_data.py`, `daily_local.py`)
   - Giá Robusta nhân xô theo tỉnh có ngày lịch sử; refresh hằng ngày đồng bộ bảng giá Nông Dân Việt, nguồn công khai có phương pháp luận.
   - Dự báo riêng Đắk Lắk dùng split theo thời gian 60% train / 20% validation / 20% holdout. Ở lần nhập ban đầu có 131 quan sát (11/06–20/10/2026); dữ liệu ngắn nên chỉ là thử nghiệm.
   - Ứng viên (giữ nguyên giá, drift/mean/median 3–5 ngày) chỉ được chọn nếu validation MAE tốt hơn baseline ít nhất 5% và đúng hướng ≥55%; holdout không dùng chọn mô hình. Nếu không đạt, xuất mốc giữ nguyên giá và ghi rõ không có tín hiệu hướng.
   - Holdout đầu tiên gồm 27 mốc: baseline giữ nguyên giá MAE 511 đ/kg, RMSE 710 đ/kg; ứng viên tốt nhất MAE 541 đ/kg và chỉ đúng hướng 5% trong các ngày giá đổi. Vì vậy chưa bật mô hình hướng giá. Kết quả này cần được coi là sơ bộ vì lịch sử nguồn mới khoảng 4 tháng.
   - Arabica ICE futures (`KC=F`) và tỷ giá `USD/VND` từ Yahoo Finance — 10 năm dữ liệu ngày.
   - Giá Robusta/Arabica tháng từ World Bank Pink Sheet (`robusta.py`), tự tìm link mới nhất.
   - Giá thị trường toàn quốc từ giacaphe.com. Giá theo tỉnh được đồng bộ từ bảng lịch sử công khai của Nông Dân Việt, ghi ngày và nguồn trong `region_*.csv`.
2. **Backfill lịch sử VN** (`backfill_vn.py` + `import_backfill.py`) — tải các bản chụp lưu trữ
   của giacaphe.com để dựng lại chuỗi giá VN quá khứ, rồi trộn vào `data/vn_domestic.csv`
   và `data/region_*.csv` (không ghi đè giá đã lấy trực tiếp).
3. **Huấn luyện** — cả hai mô hình đều bị **shrink về baseline ngây thơ** với hệ số α chọn trên
   một đoạn dữ liệu *khác* đoạn test, và nếu backtest cho thấy baseline tốt hơn thì web trả về giá hiện tại:
   - `model.py` — chuỗi **Arabica**: đặc trưng ngày (return lag, MA, momentum, RSI, volatility, tỷ giá, mùa vụ).
   - `model_robusta.py` — chuỗi **Robusta**: đặc trưng tháng (return lag, giá/MA, tỷ lệ Arabica/Robusta, độ biến động, mùa vụ).
4. **Kiểm chứng** (`audit_accuracy.py`, `audit_arabica.py`, `check_leak.py`, `backtest_official_daily.py`) — so với baseline ngây thơ,
   xét ổn định theo giai đoạn, và kiểm tra rò rỉ dữ liệu tương lai.
5. **Web** (`app.py` + `templates/index.html`) — chọn chuỗi (Robusta/Arabica) và chọn vùng;
   bảng độ chính xác có cột **Skill** và **Naive MAPE** để tự đánh giá.

## Độ chính xác (backtest walk-forward) — đọc kèm cột **Skill**

**Skill** = mô hình tốt hơn bao nhiêu % so với baseline ngây thơ (đoán "giá giữ nguyên").
**Skill ≤ 0 nghĩa là mô hình chưa chứng minh được giá trị.** Đây là cột quan trọng nhất.

**Robusta — dùng cho giá Việt Nam** (test 180 tháng cuối, α chọn trên 240 tháng trước đó):

| Hạn | MAPE | Naive MAPE | Skill | R² (%thay đổi) | Hướng | α | Số mẫu |
|---|---|---|---|---|---|---|---|
| +1 tháng | 3,99% | 3,97% | **−0,4%** | −0,006 | 54,7% | 0,2 | 179 |
| +3 tháng | 8,05% | 8,05% | **0,0%** | −0,022 | — | 0 | 177 |
| +6 tháng | 11,51% | 11,51% | **0,0%** | −0,036 | — | 0 | 174 |
| +12 tháng | 16,94% | 18,22% | **+7,0%** | 0,051 | 67,3% | 0,3 | 168 |

→ Ở hạn 1–6 tháng, **cách đoán tốt nhất vẫn là "giá giữ nguyên"**; web trả về đúng giá hiện tại (α=0).

**Arabica — chỉ dùng cho giá thế giới** (test 400 phiên cuối):

| Hạn | MAPE | Naive MAPE | Skill | R² (%thay đổi) | Hướng | α | Số mẫu |
|---|---|---|---|---|---|---|---|
| +1 ngày | 1,90% | 1,90% | **0,0%** | −0,000 | — | 0 | 399 |
| +7 ngày | 5,63% | 5,64% | **+0,2%** | −0,012 | 49,1% | 0,15 | 393 |
| +14 ngày | 8,10% | 8,19% | **+1,2%** | −0,013 | 52,9% | 0,30 | 386 |
| +30 ngày | 10,50% | 12,10% | **+13,2%** | 0,226 | 68,1% | 0,65 | 370 |

→ Chỉ hạn +30 ngày là có giá trị rõ rệt; 1–14 ngày gần như không hơn naive.

> ⚠️ **Đính chính quan trọng.** Bản trước của tài liệu này ghi Arabica +1 ngày đạt MAPE 0,65%,
> accuracy 99,35%, R² 0,996. Các số đó **sai** — do lỗi rò rỉ dữ liệu tương lai trong hàm backtest
> (`walk_forward` dựng mảng giá gốc bằng cách suy từ vị trí trong mảng thay vì lấy đúng giá tại thời điểm
> dự báo, khiến giá gốc bị lệch đúng 1 phiên về phía tương lai). Đã sửa; số liệu trong bảng trên là số đúng.
> Cách kiểm chứng: `check_leak.py`.

### Sai số của khâu quy đổi ra đ/kg còn lớn hơn cả sai số mô hình

Từ 42 quan sát giá VN đã thu thập được, tỷ lệ `VN / (Robusta × tỷ giá)`:

| Năm | Số mẫu | Tỷ lệ trung vị |
|---|---|---|
| 2011 | 4 | 0,796 |
| 2012 | 36 | 0,812 |
| 2025 | 1 | 0,886 |
| 2026 | 1 | 0,976 |

Tỷ lệ này **trôi từ ≈0,80 (2011) lên ≈0,98 (2026)** — khoảng 22%. Nghĩa là dù dự báo Robusta có đúng,
giá VN vẫn có thể lệch đáng kể vì hệ số quy đổi thay đổi theo thời gian. Hồi quy
`log(giá VN) ~ log(Robusta × tỷ giá)` cho độ dàn hồi 1,15 nhưng đó là trên dữ liệu tập trung 2011–2012
nên chưa đủ tin cậy. **Đây là hạng mục cần cải thiện tiếp.**

> Mô hình thống kê tham khảo, **không phải khuyến nghị đầu tư**.

## Lệnh thường dùng

```bash
# trên VPS
cd ~/coffee-forecast
.venv/bin/python fetch_data.py              # lấy dữ liệu mới
.venv/bin/python import_backfill.py         # trộn lịch sử backfill (nếu có)
.venv/bin/python model.py                   # huấn luyện Arabica
.venv/bin/python model_robusta.py           # huấn luyện Robusta + in metrics
sudo systemctl restart coffee-forecast      # khởi động lại web
sudo journalctl -u coffee-forecast -n 50    # xem log
curl -s localhost:8002/coffee/api/state | head -c 300

# backfill lịch sử giá VN (chạy nền, có resume)
sudo systemd-run --unit=coffee-backfill --collect \
  --working-directory=/home/ubuntu/coffee-forecast \
  /home/ubuntu/coffee-forecast/.venv/bin/python backfill_vn.py

# xem lịch cập nhật tự động
systemctl list-timers coffee-update.timer
```

## Cấu trúc

```
coffee-forecast/
├─ fetch_data.py        # lấy dữ liệu Yahoo + giacaphe (toàn quốc & theo tỉnh)
├─ robusta.py           # đọc Robusta/Arabica tháng từ World Bank Pink Sheet
├─ backfill_vn.py       # dựng lại lịch sử giá VN từ Wayback Machine
├─ import_backfill.py   # trộn dữ liệu backfill vào các chuỗi giá
├─ model.py             # mô hình Arabica (ngày)
├─ model_robusta.py     # mô hình Robusta (tháng) + quy đổi đ/kg
├─ audit_accuracy.py    # so với baseline ngây thơ + ổn định theo giai đoạn
├─ audit_arabica.py     # kiểm tra mô hình Arabica theo cùng tiêu chuẩn
├─ check_leak.py        # kiểm tra rò rỉ dữ liệu tương lai trong backtest
├─ analyze_robusta.py   # kiểm chứng chất lượng dữ liệu
├─ app.py               # Flask API + web (BASE_PATH cho phép chạy dưới /coffee/)
├─ templates/index.html
├─ requirements.txt
├─ data/                # csv dữ liệu, models.pkl, metrics*.json, regions.json
└─ deploy/              # script + cấu hình nginx/systemd dùng khi deploy
```

## Ghi chú kỹ thuật

- `BASE_PATH=/coffee` → app phục vụ tại `/coffee/` và `/coffee/api/...`; nginx **không** cắt tiền tố.
- Trang giacaphe load giá bằng JavaScript, nên chỉ những tỉnh có giá trong `<title>` mới lấy được trực tiếp
  (Đắk Lắk thường thiếu → tạm dùng giá toàn quốc và ghi rõ "ước tính").
- Backfill qua Wayback Machine bị giới hạn tần suất (429) khá nặng — chạy nền, có resume, lưu dần vào CSV.
- Yahoo Finance cần header `User-Agent` (không có sẽ trả 429).
- `numpy<2.0.0` để tránh xung đột binary với các gói khác.

## Added datasets and source audits (2026-10-21)

### Giacaphe/Y5Cafe provincial daily archive

- Collector: `fetch_giacaphe_history.py`; it is included in the existing daily updater and refresh endpoint after deployment. HTTP retries use exponential backoff and archive requests are rate-limited. Every dated archive link is checked on each run; only entries passing canonical/date/method/CSS checks are saved, and unverified pages are recorded in quality metadata instead of guessed. A transport failure aborts the refresh and restores previous snapshots so a partial fetch cannot silently look complete.
- Source: [Giacaphe domestic coffee prices](https://giacaphe.com/gia-ca-phe-noi-dia/) and dated pages under `https://giacaphe.com/gia-ca-phe-noi-dia-ngay-YYYY-MM-DD/`.
- The page explicitly states its local reference figures combine prices of two global coffee exchanges and ongoing surveys from businesses and buying agents in key growing areas. It warns the displayed figure may differ from a farmer's local purchase quote. This is **not a dealer-specific transaction price** and is not independent of its ICE inputs.
- The collector saves only rows where both the canonical URL and H1 establish the same observation date, and price values appear in CSS for the corresponding provincial table row. It never labels a live headline with yesterday's table as today's quote. It stores CMS `article:modified_time` separately; this is not treated as original publication time. Per-quote `published_at` is blank because it was not established. `collected_at_utc` is actual collection time only, not substituted for publication time.
- Raw snapshots: `data/giacaphe_dak_lak_daily_raw.csv`; normalized latest-per-date/province: `data/giacaphe_dak_lak_daily.csv`; quality/source summary: `data/giacaphe_dak_lak_daily_meta.json`. Missing dates stay absent. The public archive currently links only a recent finite set of dates; this is not a long historical source. On the 2026-10-20 fetch, 13 dated reference rows were verified per province for Đắk Lắk (2026-10-06–2026-10-20; absent dates remain absent); the latest verified quote was 93,800 VND/kg on 2026-10-20, not a verified 2026-10-21 quote. A 2026-10-21 re-fetch confirmed the same archive was exposed, with a quality note for 2026-10-03 that failed date/method/table verification; the check date is metadata, not an observed quote date.
- Terms: page is public, but an explicit automated reuse/public-display licence was not verified. Keep attribution and confirm permission before redistributing copied observations or displaying them commercially.

### VNCoffeePrice Mendeley Data v3

- Import/verification: `import_vncoffeeprice.py`; source archive preserved as `data/VNCoffeePrice_mendeley_package_ENv2.zip`.
- Dataset: Nguyen Duc, Tan; Nguyen Chi, Hai (2026), [VNCoffeePrice v3](https://data.mendeley.com/datasets/p8fhcw59b7/3), DOI [10.17632/p8fhcw59b7.3](https://doi.org/10.17632/p8fhcw59b7.3), CC BY 4.0. Attribution: “VNCoffeePrice: A Multi-Source Dataset for Robusta Coffee Price Forecasting in Vietnam”, Mendeley Data, v3.
- Archive is 473,770 bytes; SHA-256 `04c2be944c8b31b78beb180f78412be9967232e9c1ddb3083962c04274b4b7d2` verified against repository API metadata; ZIP members integrity-tested. Raw quote `source_published_at` remains blank because it is not supplied; `collected_at_utc` records this import run and the dataset release timestamp is stored separately.
- Provider describes five provincial daily coffee-price series, weather, London Robusta futures, FX, oil, and retail fuel. Dak Lak contains 1,613 observations, 2020-01-01–2026-05-22: 1,280 train, 236 validation, 97 test rows. Exact provider methodology, original local-price source, and per-quote publication timestamps are not supplied; the package README explicitly says original coffee and retail-fuel provenance needs independent verification. ICE/FX raw tables name Investing.com; this does not independently verify the local target.
- Normalized separate target: `data/vnc_official_dak_lak_daily.csv`; detailed metadata, quality, license and caveats: `data/vnc_official_dak_lak_quality.json`. Do not merge this target with Nông Dân Việt, Thị Trường Cà Phê or Giacaphe. Fractional prices are preserved; suspect low values are flagged, not removed. The series includes weekends and has 721 missing calendar dates in its 2020–2026 span; dates have not been imputed. Dataset-level publication time is not assigned as original quote publication time.
- CC BY 4.0 requires attribution and indication of changes. License metadata warns third-party components may require additional permission; verify raw price provenance before production redistribution.

### Exploratory model evaluation (not deployment evidence)

- Script: `backtest_vnc_dak_lak.py`; results: `data/vnc_dak_lak_exploratory_backtest.json`; tests: `test_vnc_pipeline.py`. Output reports MAE/RMSE in VND/kg, MASE scaled only from each period's historical training values, direction hit only among non-tie forecasts that called a direction, validation and evaluation sample counts and date ranges, persistence skill, monthly scores, moving-block-bootstrap skill intervals (exploratory only), per-target predictions, data/code checksums, and calendar gaps. It does not generate a price prediction interval.
- Evaluation result from the executed fixed year split: train through 2024; validation 2025 (236 forecasts over 365 calendar days); evaluation 2026-01-01–2026-05-22 (97 forecasts). Validation persistence MAE **2,042.54 VND/kg**; all tested candidates had higher MAE, so selected method remains persistence. On the already-public 2026 segment, persistence MAE **1,029.90 VND/kg** and selected-method skill versus persistence **0.00%**. Other 2026 candidate MAEs: Ridge-level 1,045.40; Ridge-change 1,055.22; HistGradientBoosting 1,155.76; RandomForest 1,347.95 VND/kg. The 2026 segment is not blind; this is an exploratory record, not a performance guarantee or deployment justification. The selected method is persistence, which has skill 0% versus itself by construction; **no confidence interval for that self-comparison is claimed**. For context only, the Ridge-level exploratory candidate's 95% moving-block-bootstrap skill interval was [-7.50%, +3.62%] (5-observation blocks, 2,000 resamples, seed 20261021); it spans zero, is conditional on the already-inspected 97 samples, and must not be read as independent validation.
- Target is **the next observation supplied by the dataset**, not necessarily the next calendar day or exchange session. Features use only past target quotes and forecast-origin calendar fields (not future date inputs). Models: persistence, Ridge on price, Ridge on change, HistGradientBoosting, RandomForest; expanding walk-forward refit every 5 target observations; year-based 2020–24 train, 2025 validation, 2026 evaluation. Model selection uses validation MAE only and only selects a model if it beats persistence; no signal is deployed from this analysis.
- Important: VNCoffeePrice's public 2026 “test” segment and its benchmark were downloaded/read during exploration. Therefore 2026 is **not a blind final holdout** for this project; metrics are exploratory, not independent evidence. For Đắk Lắk, the dashboard shows a withheld notice in simple and technical modes, hides derived local forecast charts/tables, and `/api/dak-lak/forecast` withholds local directional forecasts; API status is `withheld_insufficient_independent_validation`, `forecast` is null, and `directional_signal` is false. Countrywide Robusta forecasts are not scaled into a local Dak Lak forecast. The public region card marks Dak Lak forecasts unavailable; derived monthly and daily tables/lines for Dak Lak are withheld until a separate local holdout beats persistence. Do not describe them as current deployment accuracy or 95–99% accuracy. The first test attempt accidentally scored validation through 2026; that artifact was not kept. The corrected report now clips 2025 validation at 2025-12-31 (236 samples) before opening the 2026 evaluation slice. Future evidence must come from newly collected, source-verified quotes after a frozen cutoff and beat persistence in multiple regimes. An evaluation on any already-public segment is exploratory and cannot establish deployment accuracy. The web labels this series separately and never uses it as the live forecast or substitutes it for other local-source quotes. Its archived evaluation is manual/snapshot-only, not run or updated by the daily scheduler. After the corrected result, the web service was restarted and the public API was cache-busted; the page visibly rendered the separate Giacaphe and VNCoffeePrice panels with no `undefined`/`NaN` values. The existing live Dak Lak source remains Nông Dân Việt.

### ICE and ICO access findings

- [ICE Robusta contract](https://www.ice.com/products/37089079/RobustaCoffee-Futures/data) describes a global deliverable benchmark (10 tonnes, USD/metric tonne, named delivery months); it is not a Dak Lak farmgate quote. Public product/expiry pages were accessible, but no free, reusable historical observation feed/API was verified. Contract codes and expiries must be kept if later used; no continuous series is created here.
- [ICO Coffee Market Intelligence](https://data.ico.org/) is an interactive global platform. Its extraction workbench says CSV/JSON export and historical extraction are subscriber features, and full access requires an All Inclusive package. No paid subscription was purchased. ICO aggregate indicator/futures data are not a Dak Lak target.

### Re-run commands

```bash
cd ~/coffee-forecast
.venv/bin/python fetch_giacaphe_history.py     # fetches all archive links and can take 1–2 min
.venv/bin/python import_vncoffeeprice.py   # one-time versioned archive download/checksum/import
.venv/bin/python backtest_vnc_dak_lak.py      # rerun evaluation from the frozen local snapshot
.venv/bin/python -m unittest test_vnc_pipeline -v
# The scheduled updater does not redownload or rerun this public research dataset/backtest; that report is manually reproduced from the frozen snapshot only.
```

## Mô hình dẫn truyền quốc tế Đắk Lắk (Lead-Lag International Transmission Model)

### 1. Bản chất kinh tế & thị trường
- Giá cà phê Robusta nhân xô tại Đắk Lắk **không tự sinh ra đà riêng lẻ** (mô hình chuỗi thời gian tự hồi quy đơn thuần trên giá nội địa chỉ đạt độ chính xác tương đương tung đồng xu ~50%).
- Các đại lý và doanh nghiệp xuất khẩu tại Tây Nguyên định giá thu mua mỗi sáng dựa trên:
  1. **Bước nhảy sàn ICE London Robusta** chốt phiên đêm hôm trước (23:30 giờ VN).
  2. **Tỷ giá USD/VND** bán ra đầu giờ sáng của Vietcombank.
  3. **Mức trừ lùi (FOB Diff / Basis gap):** khoảng cách giữa giá xuất khẩu quy đổi và giá thu mua tại kho.

### 2. Thuật toán & Đặc trưng (`model_daklak_leadlag.py`)
- **Thuật toán:** Huber Regressor (hồi quy bền vững kháng ngoại lệ; loss bậc hai với sai số nhỏ, bậc một với sai số lớn do cú sốc thị trường).
- **Đặc trưng đầu vào (hoàn toàn chỉ dùng thông tin chốt trước thời điểm dự báo):**
  - $\Delta P_{\text{London, VND}, t-1}$: bước nhảy sàn London quy đổi đ/kg chốt đêm qua.
  - $\Delta P_{\text{London, VND}, t-2}$: bước nhảy sàn London phiên trước đó.
  - $\Delta P_{\text{Local}, t-1}$: thay đổi giá nội địa phiên hôm qua.
  - $\text{Gap}_{t-1} = P_{\text{Local}, t-1} - P_{\text{London, VND}, t-1}$: sai lệch Basis (cơ chế hiệu chỉnh sai số Error-Correction).
  - $\% \text{Return}_{\text{London}, t-1}$: tỷ lệ % biến động phiên đêm qua.

### 3. Kết quả kiểm định Walk-Forward (1.613 ngày, 2020–2026)

| Giai đoạn | Số phiên | Persistence MAE | Huber Model MAE | **Skill** | **Đoán đúng chiều** | Kiểm định Diebold-Mariano |
|---|---:|---:|---:|---:|---:|---:|
| **Validation 2025** | 224 | 1.908,4 đ/kg | **1.372,9 đ/kg** | **+28,1%** (95% CI: [19,5%, 36,4%]) | **82,5%** (206 lần gọi) | stat = 7,09 ($p < 0,0001$) |
| **Test 2026** | 107 | 1.096,0 đ/kg | **742,9 đ/kg** | **+32,2%** (95% CI: [17,2%, 46,6%]) | **86,0%** (93 lần gọi) | stat = 5,49 ($p < 0,0001$) |

- Cả hai giai đoạn đều vượt qua kiểm định Diebold-Mariano với $p < 0,0001$ (bác bỏ giả thuyết mô hình không hơn mốc giữ giá).
- Tỷ lệ đoán đúng chiều tăng/giảm đạt **82,5% – 86,0%** khi thị trường có biến động thực tế.
- Tự động chạy mỗi sáng qua `update_all.py` và cung cấp API tại `/coffee/api/dak-lak/forecast`.

### Giao diện hợp nhất (Single Unified Page)
- Đã loại bỏ hoàn toàn nút chuyển chế độ "Dễ hiểu" / "Chi tiết".
- Trang web giờ đây là **một trang duy nhất**, tối ưu trải nghiệm nhanh cho người nông dân:
  1. **Giá hôm nay:** Chữ số lớn, ghi rõ ngày và mức tăng/giảm so với hôm trước.
  2. **Dự báo xu hướng:** Huy hiệu màu nổi bật (TĂNG/GIẢM/ÍT ĐỔI), ước tính giá phiên tới, lời khuyên bán hàng bằng ngôn ngữ bình dân.
  3. **Biểu đồ trực quan:** Thể hiện đường giá thực tế 60 ngày và điểm dự đoán phiên tới.
  4. **Bảng so sánh giá vùng:** Đắk Lắk, Lâm Đồng, Gia Lai, Đắk Nông.
  5. **Bảng kiểm định kỹ thuật:** Thu gọn trong thẻ `<details>` ở cuối trang dành riêng cho người cần nghiên cứu chuyên sâu.

### Cơ chế cập nhật Real-Time & Hằng ngày tự động
Hệ thống được thiết lập chế độ cập nhật kép (Dual-Engine Update):
1. **Engine 1: Cập nhật Real-Time (Mỗi 15 phút - 24/7)**
   - Service: `coffee-realtime.service` kích hoạt bởi `coffee-realtime.timer` (OnCalendar `*:0/15`).
   - Module: `fast_refresh.py` (chạy hoàn tất trong 5–12 giây).
   - Tự động đồng bộ giá nội địa 4 tỉnh Tây Nguyên (Đắk Lắk, Lâm Đồng, Gia Lai, Đắk Nông) và giá chốt/giá khớp sàn ICE London Robusta từ Giacaphe.com & Nông Dân Việt.
   - Tính toán và phát ngay tín hiệu dự báo dẫn truyền Huber Lead-Lag phiên mới nhất.
   - Cập nhật dấu thời gian `last_fast_refresh_vn` vào `data/meta.json`.

2. **Engine 2: Huấn luyện mô hình sâu hằng ngày (09:00 sáng VN / 02:00 UTC)**
   - Service: `coffee-update.service` kích hoạt bởi `coffee-update.timer`.
   - Huấn luyện lại toàn bộ mô hình Machine Learning dài hạn (Arabica, Robusta tháng, Gold) và kiểm định walk-forward nhiều năm.

3. **Cơ chế Real-Time trên Giao diện Web (Frontend Live Polling)**
   - Thanh trạng thái trực tiếp: `🟢 Tự động cập nhật hằng ngày & thời gian thực`.
   - Cơ chế polling chạy ngầm: Mỗi 30 giây trình duyệt tự động kiểm tra trạng thái mới nhất từ `/coffee/api/state`. Nếu có giá mới hoặc tín hiệu mới, giao diện tự cập nhật mượt mà không cần tải lại trang.
   - Nút `[↻ Cập nhật dữ liệu]` kích hoạt trực tiếp `fast_refresh` và trả kết quả sau 5–8 giây.
