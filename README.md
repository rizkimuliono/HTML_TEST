# HTML LAB — Interactive LMS

LMS mini untuk materi dasar HTML: login mahasiswa, materi per modul, 20 coding challenge yang diacak, timer elapsed (tanpa countdown), penilaian, dan penyimpanan hasil.

## Jalankan lokal

Buka `index.html` langsung di browser atau jalankan static server sederhana:

```bash
python3 -m http.server 8000
```

Kemudian buka `http://localhost:8000`.

## Hubungkan ke Google Spreadsheet

Frontend GitHub Pages tidak boleh memuat client secret / refresh token. Gunakan Google Apps Script sebagai endpoint:

1. Buka spreadsheet yang dipakai, pilih **Extensions → Apps Script**.
2. Salin isi `google-apps-script/Code.gs` ke project Apps Script, lalu deploy sebagai **Web app**.
3. Set **Execute as: Me** dan **Who has access: Anyone**.
4. Salin URL `/exec` ke `config.js` pada property `apiUrl`.
5. Push perubahan ke GitHub dan aktifkan GitHub Pages dari branch utama.

Jika `apiUrl` kosong, hasil tetap tersimpan di browser mahasiswa sebagai fallback lokal. Data login dan hasil tidak akan terkirim ke mana pun sampai endpoint diisi.

## Ganti topik di masa depan

Seluruh konten dipisahkan di `course-data.js`. Untuk membuat topik CSS, ubah `title`, `modules`, dan daftar `questions`. Setiap pertanyaan menggunakan kontrak sederhana: `lessonTitle`, `lessonBody`, `lessonCode`, `starter`, `required`, dan `hint`.

`config.txt` sengaja di-ignore dan tidak boleh di-commit karena berisi kredensial.
