

async function calcNeedAmount(amount, mint) {
    const price = await getPrice(mint)
    return amount * price;
}

async function getPrice(mint) {
    while (true) {
        try {
            let url = `https://price.jup.ag/v6/price?ids=${mint}&vsToken=So11111111111111111111111111111111111111112`
            const headers = {
                'Content-Type': 'application/json',
            };
            const requestOptions = {
                method: 'GET',
                headers: headers
            };
            
            const response = await fetch(url, requestOptions);
            
            if (!response.ok) {
                console.log(`HTTP error! Status: ${response.status}`);
                return 0
            }
            
            const data = await response.json();
            let item = data["data"][mint]["price"];
            let price = parseFloat(item);

            return price
        } catch (error) {
            console.log(error);
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
    }
}

function get_format_date() {
    const date = new Date();

    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    const seconds = String(date.getSeconds()).padStart(2, '0');

    const formattedDate = `${month}/${day}/${hours}/${minutes}/${seconds}`;

    return formattedDate
}

module.exports = {
    calcNeedAmount,
    get_format_date
  };