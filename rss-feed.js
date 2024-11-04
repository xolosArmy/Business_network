async function loadRSSFeed() {
    const rssFeedContainer = document.getElementById("rss-feed");
    try {
        const response = await fetch("https://rss.app/feeds/v1.1/2HORgJLF38Qe8hLn.json");
        const data = await response.json();

        // Clear loading message
        rssFeedContainer.innerHTML = "";

        // Check if items exist in the feed
        if (data.items && data.items.length > 0) {
            // Create a list to display the feed items
            let feedList = "<ul>";
            data.items.forEach(item => {
                const date = new Date(item.pubDate).toLocaleDateString();
                feedList += `
                    <li>
                        <a href="${item.link}" target="_blank">${item.title}</a>
                        <br><small>Published on: ${date}</small>
                    </li>
                `;
            });
            feedList += "</ul>";

            rssFeedContainer.innerHTML = feedList;
        } else {
            rssFeedContainer.innerHTML = "<p>No feed items available at the moment.</p>";
        }
    } catch (error) {
        console.error("Error fetching RSS feed:", error);
        rssFeedContainer.innerHTML = "<p>Could not load the RSS feed. Please try again later.</p>";
    }
}

loadRSSFeed();
