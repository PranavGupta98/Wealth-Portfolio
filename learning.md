**What is the motivation behind using Yahoo Finance over Google?**

Google Finance has unreliable API. Trying to scrape it usually results in broken code whenever they change their website layout. Yahoo Finance, on the other hand, has a very robust, widely-used, and free Node.js library (yahoo-finance2) that handles getting the data reliably without needing any API keys or subscriptions.

**What is an in-memory cache? What happens when the app is closed?**

By "in-memory cache," meant for immediate fast loading while the app is open. However, no data is lost when you close the app. Every time it fetches prices from Yahoo, it will save them to a file on your hard drive (e.g., cache.json). When you close and reopen the app tomorrow, it will instantly load the prices from that cache.json file, and then quietly reach out to Yahoo Finance in the background to update them. It acts just like a database, but keeps things 10x simpler since we don't have to install any database software.

**What is the cors dependency?**

CORS stands for Cross-Origin Resource Sharing. Modern web browsers have a strict security rule: if your frontend is running on one address (localhost:5173) and tries to talk to a backend running on a different address (localhost:3001), the browser blocks it to prevent hackers from stealing data. The cors dependency is just a tiny plugin for the backend that says, "Hey, it's okay, I trust requests coming from localhost:5173", allowing the two pieces to communicate.