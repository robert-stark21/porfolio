# Portfolio Phu Nguyen

Website HTML/CSS/JS, không cần build. Chạy bằng `start.bat` (Node.js) trên máy, hoặc đưa lên một host có PHP. Dashboard lưu thẳng vào database của project, không cần liên kết thư mục.

## Cấu trúc
- `index.html`: khung trang.
- `data/content.json`: **database nội dung**, dashboard đọc và ghi vào đây. Mỗi lần lưu, bản cũ được giữ trong `data/backups/` (20 bản gần nhất).
- `data/auth.php`: mật khẩu dashboard (đã băm, không đọc ngược được). Tạo ở lần đầu mở dashboard trên máy.
- `server.js`: server Node chạy site và API cho dashboard (dùng trên máy, hoặc host chạy Node).
- `api/index.php`: cùng API đó viết bằng PHP, cho host thường (cPanel, hosting PHP).
- `assets/projects.js`: nội dung site đọc, được dựng lại từ `data/content.json` mỗi lần lưu: tên, email, showreel, danh sách project, Playground, ảnh trang Photo (`PHOTOS`), trang Joyous (`JOYOUS`: tên kênh, banner, danh sách trải nghiệm).
- `assets/carousel.js`: dải ảnh cong ở trang chủ (dựa theo Flex Carousel của React Bits, viết lại bằng WebGL thuần). Các thông số (chiều cao ảnh, độ cong, độ tách màu, tự chạy) nằm trong `CFG` ở đầu file.
- `assets/carousel-ring.js`: vòng ảnh xoay tròn (Circular Carousel), chỉ dùng khi trình duyệt không có WebGL2.
- `assets/joyous.js`: trang Joyous. Trang ngoài là kênh kiểu YouTube (banner, avatar đầu Phu chớp mắt, lọc theo loại, lưới thumbnail). Mỗi trang con là một trải nghiệm: `flappy` (game Phu Flies), `blob` (khối kim loại lỏng 3D), `island` (đảo nổi 3D, chạm để trồng cây), `stack` (game xếp khối 3D), `galaxy` (dải ngân hà 3D), `ballpit` (hồ bóng mặt cười). 3D dùng three.js r128 từ cdnjs, chỉ tải khi mở trang đó.
- `assets/photo.js`: trang Photo (banner Morph Slider và tường ảnh Drift Wall). Thông số nằm trong `MORPH` và `WALL` ở đầu file.
- `assets/app.js`: intro, chữ đổi kiểu nhòe, menu, email, chuyển trang, các trang con.
- `assets/style.css`: màu, font, bố cục.
- `audio/`: nhạc nền (`coffee-jazz-loop.mp3`). Đổi bài trong `SITE.music` hoặc ở tab Site của dashboard.
- `images/`: ảnh placeholder. Ảnh trang Photo nằm trong `images/photo/`, banner và thumbnail trang Joyous nằm trong `images/joyous/`.
- `_v1/`: bản đầu tiên (dạng trang cuộn dài), giữ lại để tham khảo.

## Dashboard (admin.html): thêm, sửa project và upload ảnh
1. Trên Windows, bấm đúp `start.bat` (cần cài Node.js). File này chạy `node server.js` và mở sẵn site (http://localhost:3000/) cùng dashboard (http://localhost:3000/admin.html). Dùng trình duyệt nào cũng được.
2. Lần đầu, dashboard hỏi đặt mật khẩu (ít nhất 8 ký tự). Chỉ đặt được khi mở trên chính máy của bạn. Lần sau chỉ cần đăng nhập, phiên giữ 30 ngày.
3. Thêm, sửa, xoá, kéo để sắp xếp project. Kéo thả ảnh cover và ảnh trang chi tiết vào. Ảnh được nén sang WebP rồi tải lên `images/`.
4. Bấm **Save** (hoặc Ctrl+S). Nội dung ghi vào `data/content.json`, `assets/projects.js` được dựng lại, bản cũ vào `data/backups/`.
5. Tải lại site để xem thay đổi.
- Tab **Photos**: thêm nhiều ảnh cùng lúc, sửa tên, nơi chụp, năm. Đánh dấu **Show in the top banner** cho tối đa 10 tấm sẽ chạy trên banner, thứ tự theo danh sách.
- Tab **Joyous**: mục **Channel** để sửa tên kênh, handle, dòng giới thiệu và thay banner. Mỗi mục bên dưới là một trải nghiệm: sửa tên, địa chỉ trang, loại (Game, 3D object, Space, Toy), năm, mô tả, thumbnail, và chọn trải nghiệm nào sẽ chạy trong 6 cái đã viết sẵn. Kéo để đổi thứ tự trong lưới. Game hoàn toàn mới thì cần viết thêm code trong `assets/joyous.js`.
- Tab **About**: sửa tiêu đề lớn (mỗi dòng một dòng, bản điện thoại có dòng riêng), câu dưới đầu Phu, đoạn giới thiệu, các cột kỹ năng, kinh nghiệm làm việc, mascot chạy hoặc ảnh chân dung, và bảng Approach, Process trong card Process & Approach. Mỗi hàng có nút ↑ để đổi thứ tự, × để xoá, và nút + để thêm.
- Xoá project không xoá file ảnh.
- Nếu sửa tay `assets/projects.js` sau lần lưu cuối, lần mở dashboard tiếp theo sẽ đọc lại từ file đó, lưu lại là database cập nhật theo.
- Mở `admin.html` không qua server (bấm đúp file, hoặc bản xem trên Claude) thì dashboard quay về cách cũ: nút **Open portfolio folder** để chọn thư mục trên máy (Chrome hoặc Edge).

## Thay ảnh và nội dung bằng tay
Bỏ ảnh vào `images/`, rồi sửa `image` và `gallery` của từng project trong `assets/projects.js`.
- `image`: ảnh trên carousel trang chủ, giữ nguyên tỉ lệ của ảnh.
- `palette`: 3 màu nhỏ hiện dưới thông tin project đang chọn.
- `SITE.showreel`: file video (`images/showreel.mp4`) hoặc link embed Vimeo/YouTube.
- `ABOUT`: toàn bộ nội dung trang About.
- Tất cả tên project, công ty và link mạng xã hội hiện tại đều là nội dung mẫu.

## Hiệu ứng (làm lại theo cách huyml.co hoạt động)
- Trang chủ nền đen, các ảnh xếp thành một dải ngang. Ảnh ở giữa phẳng, hai bên cong đi và tách màu. Kéo hoặc vuốt có quán tính rồi tự hít vào ảnh gần nhất. Lăn chuột 1 nấc chuyển 1 project, phím mũi tên cũng được. Bấm ảnh ở giữa để mở project, bấm ảnh khác để kéo nó vào giữa.
- Thông tin project (số đếm, tên, mô tả, role, team, launch, màu) nằm dưới vòng carousel và đổi chữ theo kiểu nhòe đi rồi rõ lại.
- Menu: bấm Menu thì hai lớp màu và tấm menu trượt ra từ bên trái, chữ trồi lên lần lượt. Rê chuột vào một mục thì các mục còn lại nhoè đi. Mũi tên đỏ nằm trước trang đang mở, bấm trang khác thì mũi tên chạy qua từng dòng.
- Email: chữ chuyển dần giữa For inquiries, Click to copy và Copied, gạch chân chạy ngang.
- Chuyển trang: màn đen trượt lên cùng tên trang, rồi thu xuống dưới.
- Loading: hình Phu bay lơ lửng ở giữa màn hình. Mỗi lần bay vọt lên, nền đen tách ra hai bên một đoạn (chỉ khi ảnh đã tải tới đó) cho tới khi lộ hết chữ Phu Nguyen trên nền trắng. Xong thì Phu vọt lên khỏi màn hình. Bấm vào màn loading để bỏ qua.
- About: đầu Phu ở giữa trang nhìn theo con trỏ chuột, tự chớp mắt, rê chuột vào hoặc chạm thì cười. Khi không có chuột (điện thoại) đầu tự nhìn quanh.
- Contact: hai tấm card nghiêng trượt lên, kéo thả được.
- About: nút Process & Approach mở tấm card kính mờ, kéo thả được.
- About: cuối trang, mascot chạy theo thanh cuộn: cuộn xuống thì chạy sang phải và ráp giáp từng bước, 6 món đồ nghề bay ra xoay quanh; ráp xong thì tự chạy tại chỗ; cuộn ngược lên thì lùi lại các bước trước. Rê chuột vào thì đồ nghề chậm lại và dãn thành vòng tròn. Code ở `assets/runner.js`, hình ở `images/mascot/run/` (thay hình thì tăng số `VER` trong runner.js). Tắt được trong tab About của dashboard để dùng ảnh chân dung.
- Playground: bố cục masonry (theo reactbits.dev/components/masonry). Mỗi ảnh giữ đúng tỉ lệ và rơi vào cột đang thấp nhất, 4 cột trên màn rộng, 3 cột vừa, 2 cột trên điện thoại. Ảnh bay lên từ dưới khi mở trang, rê chuột thì thu nhỏ nhẹ, bấm để mở lightbox.
- Joyous (nền đen): trang kênh có banner, avatar đầu Phu chớp mắt và nhìn theo chuột, nút Play something mở ngẫu nhiên một trải nghiệm. Trang con chiếm cả màn hình, có nút quay lại, nút Next và mục More from Joyous bên dưới. Phím Esc quay về trang kênh.
- Photo (nền đen): banner trên cùng chạy 10 ảnh tiêu biểu, chuyển ảnh bằng hiệu ứng tan chảy (WebGL), tự chạy mỗi 5 giây, có nút, chấm, phím mũi tên và kéo vuốt. Bên dưới là tường ảnh nghiêng trôi liên tục, rê chuột vào tấm nào thì tấm đó nổi lên, bấm để mở popup xem lớn.

## Mascot
- `images/mascot/flying.png`: hình Phu đang bay dùng cho màn loading, lấy từ gói mascot (nhịp bay nằm trong `FLY` ở `assets/app.js`). `jump.png` là hình nhảy cũ, không còn dùng.
- `assets/lottie/phu-head.json`: file Lottie của đầu Phu. Đầu được tách thành 3 lớp ảnh: phần đầu và tóc, mắt mũi miệng (6 biểu cảm: mở mắt, lim dim, nhắm, 3 mức cười) và vùng mặt để che. Timeline là lưới 21 × 21 hướng nhìn: khung = hàng × 21 + cột (cột 0 nhìn trái, 20 nhìn phải; hàng 0 nhìn lên, 20 nhìn xuống). `phu-head.js` là cùng dữ liệu đó để trang tải bằng thẻ script.
- Các lớp vẫn là ảnh bitmap từ hình gốc, chưa vẽ lại thành vector. Nếu sau này có bản vector tách lớp, chỉ cần thay file Lottie này, giữ nguyên tên lớp `phu-f-open`, `phu-f-half`, `phu-f-closed`, `phu-f-smile1..3`.

## Font giống huyml (BT Glyphius, BT Grotesk)
Đây là font trả phí của BeaType. Nếu mua bản quyền, đặt file vào `assets/fonts/` với tên
`BTGlyphius-Regular.woff2`, `BTGrotesk-Regular.woff2` và `BTGrotesk-Medium.woff2`. Site sẽ tự dùng.

## Đưa lên mạng
- **Host có PHP** (cPanel, hosting thường ở VN, PHP 7.4 trở lên): upload cả thư mục, nhớ có thư mục `data/` (chứa mật khẩu đã đặt trên máy). Mở `ten-mien/admin.html`, đăng nhập bằng mật khẩu đó và lưu như trên máy. Host cần cho phép PHP ghi vào `data/`, `assets/`, `images/`, `audio/` (thường là quyền 755).
- **Host chạy Node** (VPS, Render, Railway...): chạy `node server.js` (cổng lấy từ biến `PORT`). Trên host lưu file tạm thời (như Render gói free), nội dung sửa sẽ mất khi host khởi động lại, nên dùng ổ đĩa lưu trữ lâu dài.
- **Host tĩnh** (Netlify, Vercel, GitHub Pages): site chạy bình thường nhưng dashboard trên đó không lưu được. Sửa trên máy rồi upload lại.
- Mật khẩu chỉ đặt được trên máy, không đặt được trên host, nên người ngoài không chiếm được dashboard trước bạn. Muốn đổi mật khẩu: xoá `data/auth.php` trên máy, mở lại dashboard để đặt mới, rồi upload file đó lên.

## Nhạc nền

Nút **Audio** trên thanh trên cùng bật nhạc nền và âm thanh giao diện. Nhạc lặp liền không bị ngắt, lên dần khi bật, nhỏ dần khi tắt, bật lại thì chạy tiếp chỗ cũ, và tạm dừng khi chuyển sang tab khác. Trình duyệt không cho tự phát nhạc khi chưa bấm gì, nên lần đầu khách phải bấm Audio; nếu lần trước họ để On thì nhạc tự chạy ở lần bấm đầu tiên trên trang. Âm lượng nằm ở `music.vol` trong `assets/app.js` (mặc định 0.32).
