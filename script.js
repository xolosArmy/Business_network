document.addEventListener('DOMContentLoaded', async () => {
    console.log('DOM fully loaded and parsed');

    // Initialize Google Translate
    function googleTranslateElementInit() {
        new google.translate.TranslateElement({
            pageLanguage: 'en',
            includedLanguages: 'es,fr,de,it,ja,ko,pt,ru,zh-CN'
        }, 'google_translate_element');
    }

    // Populate business list
    const businessList = document.getElementById('business-list');
    const businesses = [
        {
            name: 'Xolos Ramirez',
            description: 'El mejor criadero de perro prehispánico xoloitzcuintle en México.',
            url: 'https://www.xolosramirez.com'
        }
    ];

    businesses.forEach(business => {
        const listItem = document.createElement('li');
        listItem.innerHTML = `
            <h3>${business.name}</h3>
            <p>${business.description}</p>
            <a href="${business.url}" target="_blank">${business.url}</a>
        `;
        businessList.appendChild(listItem);
    });

    // Initialize memo feed with Chaingraph-ts
    await fetchMemos();
});

// Import Chaingraph-ts
import { ChaingraphClient, graphql } from "chaingraph-ts";

// Chaingraph Client Configuration
const chaingraphUrl = "https://gql.chaingraph.pat.mn/v1/graphql";
const chaingraphClient = new ChaingraphClient(chaingraphUrl);

// Define GraphQL Query for Memos
const fetchMemosQuery = graphql(`
  query FetchMemos($app: String!) {
    memo(where: { app: { _eq: $app } }, order_by: { timestamp: desc }, limit: 10) {
      app
      content
      timestamp
    }
  }
`);

// Fetch Memos and Update the DOM
async function fetchMemos() {
    const variables = { app: "xolosarmy" }; // Replace "xolosarmy" with your app identifier
    try {
        const result = await chaingraphClient.query(fetchMemosQuery, variables);
        if (!result.data) {
            console.error("No data returned from the query");
            return;
        }

        // Render Memo Data
        const memoData = result.data.memo;
        const memoFeed = document.getElementById("memo-feed");
        memoFeed.innerHTML = memoData.map(memo => `
            <div class="memo-post">
                <p>${memo.content}</p>
                <small>${new Date(memo.timestamp).toLocaleString()}</small>
            </div>
        `).join('');
    } catch (error) {
        console.error("Error fetching memos:", error);
    }
}

// Utility Functions (Optional)
const formatDate = (str) => {
    const options = { hour: "numeric", minute: "numeric" };
    return new Date(str).toLocaleDateString('en-us', options);
};

const newElement = (tag, classes, text) => {
    const ele = document.createElement(tag);
    ele.classList.add(...classes);
    ele.textContent = text;
    return ele;
};
