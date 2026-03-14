const html = `\\\"data-publisher\\\":\\\"1550542\\\"`;
const publisherId = "1550542";
const escaped = publisherId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const universalPattern = new RegExp(`data-publisher[\\s]*[=:"']+[\\s]*${escaped}`, 'i');
const loosePattern = new RegExp(`data-publisher.{0,30}${escaped}`, 'i');
console.log("Universal:", universalPattern.test(html));
console.log("Loose:", loosePattern.test(html));
