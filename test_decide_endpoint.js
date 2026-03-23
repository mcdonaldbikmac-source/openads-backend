async function test() {
    try {
        const res = await fetch("https://openads-backend.vercel.app/api/v1/serve/decide?placement=responsive-0xTestAdminYieldWallet12345678901234567890&position=floating&parent_url=https%3A%2F%2Ftest.com");
        const data = await res.json();
        console.log("Status:", res.status);
        console.log("Data:", JSON.stringify(data, null, 2));
    } catch(e) {
        console.error(e);
    }
}
test();
