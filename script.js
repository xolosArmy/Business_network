document.addEventListener('DOMContentLoaded', async () => {
    console.log('DOM fully loaded and parsed');

    // Initialize Google Translate
    function googleTranslateElementInit() {
        new google.translate.TranslateElement({
            pageLanguage: 'en',
            includedLanguages: 'es,fr,de,it,ja,ko,pt,ru,zh-CN'
        }, 'google_translate_element');
    }

    // Call Google Translate Initialization
    googleTranslateElementInit();

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

    // GraphQL Query for Fetching Memos
    const fetchMemosQuery = `
        query FetchMemos($app: String!) {
            memo(where: { app: { _eq: $app } }) {
                content
                timestamp
            }
        }
    `;

    // Initialize GraphQL Client (Replace URL with your GraphQL endpoint)
    const endpoint = 'https://your-chaingraph-endpoint.com/graphql'; // Replace with your GraphQL endpoint
    const chaingraphClient = {
        query: async (query, variables) => {
            const response = await fetch(endpoint, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ query, variables }),
            });
            const result = await response.json();
            if (result.errors) {
                throw new Error(result.errors.map(e => e.message).join(', '));
            }
            return result;
        }
    };

    // Fetch Memos and Update the DOM
    async function fetchMemos() {
        const variables = { app: "xolosarmy" }; // Replace "xolosarmy" with your app identifier
        try {
            const result = await chaingraphClient.query(fetchMemosQuery, variables);
            if (!result.data || !result.data.memo) {
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

    // Call fetchMemos
    fetchMemos();
});
