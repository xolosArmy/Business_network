document.addEventListener('DOMContentLoaded', () => {
    console.log('DOM fully loaded and parsed');


// Initialize Google Translate
function googleTranslateElementInit() {
    new google.translate.TranslateElement({
        pageLanguage: 'en',
        includedLanguages: 'es,fr,de,it,ja,ko,pt,ru,zh-CN'
    }, 'google_translate_element');
}


    const businessList = document.getElementById('business-list');

    const businesses = [
        {
            name: 'Xolos Ramirez',
            description: 'El mejor criadero de perro prehispánico xoloitzcuintle en México.',
            url: 'https://www.xolosramirez.com'
        }
        // Puedes agregar más negocios aquí
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
});

const memoFeed = async () => {
    const url = 'https://graph.cash/graphql';
    const query = `
        query ($address: Address!) {
            address (address: $address) {
                profile {
                    posts(newest: true, start: "2030-01-01T00:00:00-00:00") {
                        lock {
                            address
                        }
                        tx {
                            hash
                            seen
                            blocks {
                                block {
                                    hash
                                    timestamp
                                }
                            }
                        }
                        text   
                    }
                }
            }
        }
    `;

    const response = await fetch(url, {
        method: "POST",
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify({
            query: query,
            variables: {
                address: "1Kq5hxjgyzTow9KTMzBJDuSeW3S2eHpXhx",
                newest: true,
            },
        })
    });

    const json = await response.json();
    const feed = document.getElementById('memo-feed');

    json.data.address.profile.posts.splice(0, 10).forEach(post => {
        const addressInfo = `Address: ${post.lock.address}`;
        const txInfo = `Tx: ${formatHash(post.tx.hash)} ${formatDate(post.tx.seen)}`;
        const postText = `${post.text}`;

        const divCard = newElement("div", ["card"]);
        const divCardBody = newElement("div", ["card-body"]);
        const divPostText = newElement("h5", ["card-title"], postText);
        const divAddressInfo = newElement("div", ["card-text"], addressInfo);
        const divTxInfo = newElement("div", ["card-text"], txInfo);
        const aMemoLink = newElement("a", ["card-link"], "View on Memo");

        let blockInfo;
        if (post.tx.blocks && post.tx.blocks.length) {
            const block = post.tx.blocks[0].block;
            blockInfo = `Block: ${formatHash(block.hash)} ${formatDate(block.timestamp)}`;
        } else {
            blockInfo = `Unconfirmed tx`;
        }
        const divBlockInfo = newElement("div", ["card-text"], blockInfo);

        aMemoLink.href = `https://memo.cash/post/${post.tx.hash}`;
        aMemoLink.target = "memo";

        divCard.append(divCardBody);
        divCardBody.append(divPostText);
        divCardBody.append(divAddressInfo);
        divCardBody.append(divTxInfo);
        divCardBody.append(divBlockInfo);
        divCardBody.append(aMemoLink);

        feed.appendChild(divCard);
    });
};

const newElement = (tag, classes, text) => {
    const ele = document.createElement(tag);
    ele.classList.add(...classes);
    ele.textContent = text;
    return ele;
};

const formatDate = (str) => {
    const options = { hour: "numeric", minute: "numeric" };
    return new Date(str).toLocaleDateString('en-us', options);
};

const formatHash = (str) => {
    if (str.length <= 15) {
        return str;
    }
    return `${str.substring(0, 6)}...${str.slice(-6)}`;
};

memoFeed().then();

import { ChaingraphClient, graphql } from "chaingraph-ts";

// 1. Define Chaingraph GraphQL URL
const chaingraphUrl = "https://gql.chaingraph.pat.mn/v1/graphql";
const chaingraphClient = new ChaingraphClient(chaingraphUrl);

// 2. Define GraphQL query to fetch Memo posts
const fetchMemosQuery = graphql(`
  query FetchMemos($app: String!) {
    memo(where: { app: { _eq: $app } }, order_by: { timestamp: desc }, limit: 10) {
      app
      content
      timestamp
    }
  }
`);

// 3. Fetch Memos Function
async function fetchMemos() {
  const variables = { app: "xolosarmy" }; // Replace "xolosarmy" with the app identifier used for your memos
  try {
    const result = await chaingraphClient.query(fetchMemosQuery, variables);
    if (!result.data) {
      console.error("No data returned from the query");
      return;
    }

    // Process memo data and update the page
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

// 4. Initialize Fetch on Page Load
document.addEventListener("DOMContentLoaded", fetchMemos);



    
