const puppeteer = require('puppeteer');
const cliProgress = require('cli-progress');
const createCsvWriter = require('csv-writer').createObjectCsvWriter;

const city = process.argv[2]

if (!city) {
    console.error("please provide a city to scrape hotels information for")
    process.exit(1)
}

let dataPoints = []


let progressBar = new cliProgress.SingleBar({}, cliProgress.Presets.shades_classic);

puppeteer.launch().then(async (browser) => {
    const page = await blockImages(await browser.newPage())

    await page.goto(`https://www.google.com/travel/hotels/${city}`, {waitUntil: 'networkidle2'});

    const numberOfHotels = await page.$eval("#wKdiD", h1 => +h1.innerText.split(" ")[0].replace(",", ""))
    console.log(`scraping information for ${numberOfHotels} hotels in ${city}`)

    progressBar.start(numberOfHotels, 0)

    await scrapePage(page, browser)

    logHotelData(dataPoints)

    await browser.close();

})


async function scrapePage(page, browser, isFirstPage = true) {

    await page.waitForSelector(".l5cSPd c-wiz a.PVOOXe")


    const hotelUrls = await page.$$eval(".l5cSPd c-wiz a.PVOOXe", anchors => anchors.map(a => a.href))


    const pagesPerBatch = 4

    for (let i = 0; i < hotelUrls.length; i += pagesPerBatch) {

        await Promise.all(hotelUrls.slice(i, i + pagesPerBatch).map(u => scrapeHotel(browser, u)))
            .then(dataArray => {
                dataArray.forEach(data => {
                    dataPoints.push(data)
                })
            })
            // recover gracefully from a listing scrapipng that failed for some reason
            .catch(console.error)
    }


    try {
        await page.click(isFirstPage ?
            "#yDmH0d > c-wiz.zQTmif.SSPGKf > div > div.lteUWc > div > c-wiz > div > div.gpcwnc > div.cGQUT > main > div > div.Hkwcrd.Sy8xcb.XBQ4u > c-wiz > div.J6e2Vc > div > div > div.ZFr60d.CeoRYc"
            : "#yDmH0d > c-wiz.zQTmif.SSPGKf > div > div.lteUWc > div > c-wiz > div > div.gpcwnc > div.cGQUT > main > div > div.Hkwcrd.Sy8xcb.XBQ4u > c-wiz > div.J6e2Vc > div:nth-child(2) > div > span > span")
        return scrapePage(page, browser, false)
    } catch (e) {
        return
    }
}


async function scrapeHotel(browser, url) {

    const page = await blockImages(await browser.newPage())

    await page.goto(url, {waitUntil: 'networkidle2'})

    await page.click("#overview").catch(Function)

    const name = await page.$eval("#overview > c-wiz > div > div.FbLHzc.kh7loe > div > div > div.iInyCf.QqZUDd > section.OEscc.YFK2Re > h1", node => node.textContent)

    let stars = await page.$eval("#overview > c-wiz > div > div.FbLHzc.kh7loe > div > div > div.iInyCf.QqZUDd > section.OEscc.YFK2Re > div.fnmyY > span", node => node
        .textContent.split("-")[0])
        .catch(() => "N/A")

    const mainPrice = await page.$eval("#overview > c-wiz > div > div.FbLHzc.kh7loe > div > div > div.iInyCf.QqZUDd > section.OEscc.YFK2Re > div.PQl5I > div > c-wiz > div > div > span.qDsm0c.prxS3d", node => node.textContent.split(" ")[1])
        .catch(() => {
            // console.log(`couldn't find main price on the overview page of ${name}`)
            return "N/A"
        })

    const [address, tel] = await page.$eval("#overview > c-wiz > div > div.FbLHzc.kh7loe > div > div > div.iInyCf.QqZUDd > section.OEscc.YFK2Re > div.fnmyY > div", node => node
        .textContent
        .split("•"))

    const website = await page.$eval("#overview > c-wiz > div > div.FbLHzc.kh7loe > div > div > div.iInyCf.QqZUDd > section.OEscc.YFK2Re > div.VS92ie.bJjiTc > span:nth-child(1) > div > div > a", node => node.href)
        .catch(() => {
            // console.log(`couldn't find website on the overview page of ${name}`)
            return "N/A"
        })

    await page.click("#reviews")
    const reviews = await page.$eval("#reviews > c-wiz > div > div > div > div:nth-child(1) > div > div.Gphfib > div.ODhBmf > div > div.BARtsb", node => node.textContent)
        .catch(() => {
            // console.log(`couldn't find any reviews for ${name}`)
            return "N/A"
        })



    await page.click("#details").catch(() => {
        //() => console.error("there is no details page for " + name)
    })

    const popularAmenties = await page.$$eval("#details > c-wiz > div > div > div > div > section:nth-child(2) > div.RhdAVb.G8T82.bDSFKc > div > ul li", lis => lis.map(li => li.innerText).join(" | "))
        .catch(() => {
            // console.log(`couldn't find popular Amenties for ${name}`)
            })

    const amenties = await page.$$eval(("#details > c-wiz > div > div > div > div > section:nth-child(2) > div.YOCwW.G8T82 > div > div.IYmE3e"),
        amenties => amenties.map(amenty => [amenty.querySelector("h4").innerText.toLowerCase(),
        [...amenty.querySelectorAll("ul li")]
            .filter(li => li.querySelector("span svg path").getAttribute("d").startsWith("M9"))
            .map(li => li.innerText)
            .join(" | ")]))

    const [internet, policiesAndPayments,
        children,
        parkingAndTransportation,
        accessibility,
        pets,
        foodAndDrink,
        services,
        pools,
        wellness,
        businessAndEvents,
        rooms] = ["internet",
            "policies",
            "children",
            "parking",
            "accessibility",
            "pets",
            "food",
            "services",
            "pools",
            "wellness",
            "businessAndEvents",
            "rooms"
        ].map(am => {
            let a = amenties.find(([a]) => a.startsWith(am))
            return a && a[1]
        })

    await page.click("#prices")

    let prices = (await Promise.all([

        page.$$eval("#prices > c-wiz > div > div.G86l0b > div > div > div > div > div > section > div.Hkwcrd.q9W60.A5WLXb.G3p8qb > c-wiz > div > div > span > div > div > div > div > div > a > div",
            ds => ds.filter(d => d.innerText)
                .map(d => [
                    d.querySelector("div.vPRNge > div.cFdfnb > div > span.mK0tQb > span").innerText,
                    d.querySelector("div.mm6Dxc.hGTXTe > span > span > span.MW1oTb").innerText.split(" ")[1]]
                )
        ).catch(() => [])

        , page.$$eval("#prices > c-wiz > div > div.G86l0b > div > div > div > div > div > section > div.Hkwcrd.q9W60.A5WLXb.G3p8qb > c-wiz > div > div > div:nth-child(2) > span > div > div > div > div > div > a",
            ds => ds.map(d => [d.querySelector("div.cFdfnb > div > span.mK0tQb > span").innerText, d.querySelector("div.mm6Dxc.hGTXTe > span > span").innerText.split(" ")[1]]
            )
        ).catch(() => [])

        , page.$$eval("#prices > c-wiz > div > div.G86l0b > div > div > div > div > div > section > div.Hkwcrd.q9W60.A5WLXb.G3p8qb > c-wiz > div > div > div:nth-child(2) > span > div",
            els => els.map(e => ["div > div > div > div > a > div > div.cFdfnb > div > span.mK0tQb > span", "div > div > div > div > a > div > div.mm6Dxc.hGTXTe > span > span > span.MW1oTb"].map(selector => e.querySelector(selector).innerText))
                // filter the header
                .filter(([site, price]) => site !== null && price !== null)
                .map(([site, price]) => ["price on " + site.innerText, price.innerText.split(" ")[1]])
                // sort by alphabetical order
                .sort(([site1], [site2]) => site1 > site2))
            .catch(() => [])



    ]))


    const [
        agoda_price,
        bookety_price,
        booking_price,
        expedia_price,
        findHotel_price,
        orbitz_price,
        radissonhotels_price,
        travelocity_price,
        etrip_price,
        wotif_price,
        zenHotels_price,
        ebookers_price,
        rehlat_price] = ["agoda",
            "bookety",
            "booking",
            "expedia",
            "findhotel",
            "orbitz",
            "radisson",
            "travelocity",
            "etrip",
            "wotif",
            "zenhotels",
            "ebookers",
            "rehlat"]
            .map(site => {
                // make sure we have price data
                let ps = prices.filter(ps => ps.length > 0)[0]
                if (ps) {
                    // return the price data for the website if any
                    let price = ps.find(([s]) => s.toLowerCase().includes(site))
                    if (price) return price[1]
                }
            })

    progressBar.increment()

    await page.close()

    return {
        name,
        stars,
        mainPrice,
        reviews,
        agoda_price,
        bookety_price,
        booking_price,
        etrip_price,
        expedia_price,
        findHotel_price,
        orbitz_price,
        radissonhotels_price,
        travelocity_price,
        etrip_price,
        wotif_price,
        zenHotels_price,
        ebookers_price,
        rehlat_price,
        prices: JSON.stringify(prices),
        popularAmenties,
        internet,
        policiesAndPayments,
        children,
        parkingAndTransportation,
        accessibility,
        pets,
        foodAndDrink,
        services,
        pools,
        wellness,
        businessAndEvents,
        rooms,
        address,
        tel,
        website
    }
}

function logHotelData(data) {
    const csvWriter = createCsvWriter({
        path: `${city}.csv`,
        header: [
            {id: 'name', title: 'name'},
            {id: 'stars', title: 'stars'},
            {id: 'mainPrice', title: 'overview price'},
            {id: 'reviews', title: 'reviews'},
            {id: 'agoda_price', title: 'agoda_price'},
            {id: 'bookety_price', title: 'bookety_price'},
            {id: 'booking_price', title: 'booking_price'},
            {id: 'etrip_price', title: 'etrip_price'},
            {id: 'expedia_price', title: 'expedia_price'},
            {id: 'findHotel_price', title: 'findHotel_price'},
            {id: 'orbitz_price', title: 'orbitz_price'},
            {id: 'radissonhotels_price', title: 'radissonhotels_price'},
            {id: 'travelocity_price', title: 'travelocity_price'},
            {id: 'wotif_price', title: 'wotif_price'},
            {id: 'zenHotels_price', title: 'zenHotels_price'},
            {id: 'ebookers_price', title: 'ebookers_price'},
            {id: 'rehlat_price', title: 'rehlat_price'},
            {id: 'address', title: 'address'},
            {id: 'tel', title: 'tel'},
            {id: 'website', title: 'website'},
            {id: 'popularAmenties', title: 'popular amenties'},
            {id: 'internet', title: 'internet'},
            {id: 'policiesAndPayments', title: 'policies and payments'},
            {id: 'children', title: 'children'},
            {id: 'parkingAndTransportation', title: 'parking and transportation'},
            {id: 'accessibility', title: 'accessibility'},
            {id: 'pets', title: 'pets'},
            {id: 'foodAndDrink', title: 'foodAndDrink'},
            {id: 'services', title: 'services'},
            {id: 'pools', title: 'pools'},
            {id: 'wellness', title: 'wellness'},
            {id: 'businessAndEvents', title: 'business and events'},
            {id: 'rooms', title: 'rooms'}
        ]
    });


    return csvWriter.writeRecords(data)
}

async function blockImages(page) {
    // block images for faster processing
    await page.setRequestInterception(true);
    page.on('request', (request) => {
        if (request.resourceType() === 'image') request.abort();
        else request.continue();
    });
    return page
}



