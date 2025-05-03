import { chromium } from "playwright";

const userDataDir = ".browser";
const browser = await chromium.launchPersistentContext(userDataDir, {
	headless: false, // bisa dibuat true kalau di server
	locale: "id-ID",
	args: ["--lang=id"],
});
const page = await browser.newPage();
const gaiaId = process.argv[2];
await page.goto(`https://www.google.com/maps/contrib/${gaiaId}/reviews`);

try {
	await page.waitForSelector('[role="main"]');
	await new Promise((resolve) => setTimeout(resolve, 1_000));

	const profile = await (
		await page.$(`img[alt="Foto profil"]`)
	)?.getAttribute("src");
	const name = await (await page.$(".fontHeadlineLarge"))?.textContent();

	const subheading = await (
		await page.$(`[role="main"] .fontTitleSmall .fontBodySmall`)
	)?.textContent();

	const poin = await (await page.$(`.VEEl9c`))?.textContent();

	// Generator untuk scroll pelan-pelan dan yield setiap review
	async function* reviewGenerator(tabPanel: import("playwright").Locator) {
		let seen = new Set<string>();
		let lastCount = 0;
		let sameCountTimes = 0;
		while (sameCountTimes < 3) {
			const reviews = await tabPanel
				.locator('[role="button"][data-review-id]')
				.all();
			if (reviews.length === lastCount) {
				sameCountTimes++;
			} else {
				sameCountTimes = 0;
				lastCount = reviews.length;
			}
			for (const review of reviews) {
				const id = await review.getAttribute("data-review-id");
				if (id && !seen.has(id)) {
					seen.add(id);

					// Klik semua elemen 'Lainnya' (aria-expanded="false") di dalam review saja, satu per satu
					while (true) {
						const elLainnya = await review
							.locator('[aria-expanded="false"]')
							.first();
						if ((await elLainnya.count()) === 0) break;
						await elLainnya.click();
					}

					await review.scrollIntoViewIfNeeded();
					yield review;
				}
			}
			await tabPanel.evaluate((el) => el.scrollBy(0, 200));
		}
	}

	await page.getByRole("tab", { name: "Ulasan" }).click();
	const reviewsTabPanel = await page.getByRole("tabpanel");

	// Array untuk menyimpan data review sementara
	const allReviews: any[] = [];

	for await (const review of reviewGenerator(reviewsTabPanel)) {
		const text = await review.textContent();
		// Ambil title review dengan XPath tanpa class sama sekali
		const titleLocator = review.locator(
			"xpath=.//div[normalize-space(text()) and not(*)][1]"
		);
		let title = "";
		if ((await titleLocator.count()) > 0) {
			title = (await titleLocator.first().textContent()) ?? "";
		}

		// Ambil alamat (address) - diasumsikan div berikutnya setelah title
		const addressLocator = review.locator(
			"xpath=.//div[normalize-space(text()) and not(*)][2]"
		);
		let address = "";
		if ((await addressLocator.count()) > 0) {
			address = (await addressLocator.first().textContent()) ?? "";
		}

		// Ambil rating (jumlah bintang) - span dengan aria-label mengandung "bintang"
		const ratingLocator = review.locator(
			'xpath=.//span[contains(@aria-label, "bintang")]'
		);
		let rating = "";
		if ((await ratingLocator.count()) > 0) {
			rating = (await ratingLocator.first().getAttribute("aria-label")) ?? "";
		}

		// Ambil waktu (misal: "sebulan lalu") - span setelah rating
		const timeLocator = review.locator(
			'xpath=.//span[contains(text(), "lalu") or contains(text(), "tahun") or contains(text(), "bulan") or contains(text(), "minggu") or contains(text(), "hari") or contains(text(), "jam") or contains(text(), "menit") or contains(text(), "detik")]'
		);
		let time = "";
		if ((await timeLocator.count()) > 0) {
			time = (await timeLocator.first().textContent()) ?? "";
		}

		// Ambil isi review utama (span di dalam div dengan lang/id, biasanya berisi teks review)
		const reviewTextLocator = review.locator("xpath=.//div[@lang][@id]//span");
		let reviewTexts: string[] = [];
		if ((await reviewTextLocator.count()) > 0) {
			const allTexts = await reviewTextLocator.allTextContents();
			reviewTexts = allTexts.filter((text) => text.trim().length > 0);
		}
		reviewTexts = [...new Set(reviewTexts)];

		// Ambil gambar-gambar (jika ada) dari button[data-photo-index]
		const imageButtons = await review.locator("button[data-photo-index]").all();
		const imageUrls: string[] = [];
		for (const btn of imageButtons) {
			const style = await btn.getAttribute("style");
			if (style) {
				const match = style.match(/background-image:\s*url\(["']?(.*?)["']?\)/);
				if (match && match[1]) {
					imageUrls.push(match[1]);
				}
			}
		}

		// Ambil tanggapan dari pemilik (jika ada) tanpa menggunakan class
		let ownerResponse = null;
		const ownerResponseRoot = review.locator(
			'xpath=.//span[contains(text(), "Tanggapan dari pemilik")]/parent::div/parent::div'
		);
		if ((await ownerResponseRoot.count()) > 0) {
			// Ambil waktu: span setelah "Tanggapan dari pemilik"
			const timeLocator = ownerResponseRoot.locator(
				'xpath=.//span[contains(text(), "Tanggapan dari pemilik")]/following-sibling::span[1]'
			);
			// Ambil isi tanggapan: div[@lang] di dalam root
			const textLocator = ownerResponseRoot.locator("xpath=.//div[@lang]");
			const time =
				(await timeLocator.count()) > 0
					? (await timeLocator.first().textContent()) ?? ""
					: "";
			const text =
				(await textLocator.count()) > 0
					? (await textLocator.first().textContent()) ?? ""
					: "";
			ownerResponse = {
				time: time.trim(),
				text: text.trim(),
			};
		}

		// Ambil reviewId dari atribut data-review-id
		const reviewId = (await review.getAttribute("data-review-id")) ?? "";

		allReviews.push({
			reviewId,
			title: title.trim(),
			address: address.trim(),
			rating: rating.trim(),
			time: time.trim(),
			reviewText: reviewTexts.join(" ").trim(),
			images: imageUrls,
			ownerResponse,
			reviewLocator: review, // simpan locator untuk klik tombol bagikan nanti
		});
	}

	// Setelah semua review terkumpul, proses untuk ambil link share
	for (const data of allReviews) {
		const review = data.reviewLocator;
		// Cari tombol Bagikan di dalam review
		const shareBtn = review.locator(
			'xpath=.//button[contains(@aria-label, "Bagikan")]'
		);
		if ((await shareBtn.count()) > 0) {
			await shareBtn.first().click();

			// Tunggu input di dalam modal terisi value
			const input = page.locator('#modal-dialog input[type="text"]');
			await input.waitFor({ state: "visible", timeout: 5000 });
			await page.waitForFunction(
				(el) =>
					!!el &&
					"value" in el &&
					(el as HTMLInputElement).value &&
					(el as HTMLInputElement).value.length > 0,
				await input.elementHandle(),
				{ timeout: 5000 }
			);
			const link = await input.inputValue();
			data.reviewLink = link;
			// Tutup modal share jika perlu (tekan Escape)
			const closeButton = page.locator(
				'#modal-dialog button[aria-label="Tutup"]'
			);
			await closeButton.click();
		} else {
			data.reviewLink = "";
		}
		// Hapus locator agar tidak error saat serialisasi
		delete data.reviewLocator;
	}

	// Gabungkan data profile dan review ke satu variabel
	const result = {
		profile: profile ?? "",
		name: name?.trim() ?? "",
		subheading: subheading?.trim() ?? "",
		poin: poin?.trim() ?? "",
		reviews: allReviews,
	};

	console.log(JSON.stringify({ success: true, data: result }));
} catch (error: any) {
	console.log(JSON.stringify({ success: false, error: error.message }));
}
