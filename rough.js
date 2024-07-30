const express = require("express");
const port = 5000;
const cheerio = require('cheerio');
const fs = require('fs');
const bodyParser = require('body-parser')
const axios = require('axios');
const path = require('path');
const natural = require('natural');
const { GoogleAICacheManager, GoogleAIFileManager, GoogleGenerativeAI } = require('@google/generative-ai/server');
const dotenv = require('dotenv')
const { URL } = require('url');
const app = express();
app.use(express.json());
dotenv.config();


const cacheManager = new GoogleAICacheManager(process.env.API_KEY);
const fileManager = new GoogleAIFileManager(process.env.API_KEY);


// Helper function to fetch all links from a given URL
async function getLinks(url) {
    try {
      console.log(`Fetching data from URL: ${url}`);
      const { data } = await axios.get(url);
      const $ = cheerio.load(data);
      const links = [];
  
      $('a').each((index, element) => {
        let link = $(element).attr('href');
        if (link) {
          try {
            // Check if link is relative or absolute
            if (!link.startsWith('http') && !link.startsWith('https')) {
              link = new URL(link, url).href; // Resolve relative URL
            }
            // Filter out unsupported protocols
            if (!link.startsWith('#') && !link.startsWith('mailto:') && !link.startsWith('tel:')) {
              links.push(link); // Push valid links
            }
          } catch (error) {
            console.error(`Error resolving URL (${link}): ${error.message}`);
          }
        }
      });
  
      return links;
    } catch (error) {
      console.error(`Error fetching URL: ${error.message}`);
      return [];
    }
  }
  
  // Function to perform retry with delay
  async function fetchWithRetry(url, retries = 3, delay = 1000) {
    for (let i = 0; i < retries; i++) {
      try {
        return await axios.get(url);
      } catch (error) {
        if (i < retries - 1) {
          console.error(`Retrying fetch for URL ${url}. Attempt ${i + 2}`);
          await new Promise(res => setTimeout(res, delay));
        } else {
          console.error(`Failed to fetch URL ${url} after ${retries} attempts`);
          throw error;
        }
      }
    }
  }
  
  
  app.post('/scrape', async (req, res) => {
    const { url } = req.body;
  
    if (!url) {
      return res.status(400).json({ error: 'URL is required' });
    }
  
    try {
      const ipResponse = await axios.get('https://api.ipify.org/?format=json');
      const ipAddress = ipResponse.data.ip;
  
      const aiChatbotDir = path.join(__dirname, '../AIChatbot');
      if (!fs.existsSync(aiChatbotDir)) {
        fs.mkdirSync(aiChatbotDir);
      }
  
      const timestamp = Date.now();
      const domainName = new URL(url).hostname.replace(/\W+/g, '-');
      const aggregatedFileName = `${domainName}-${timestamp}-aggregated.json`;
      const aggregatedFilePath = path.join(aiChatbotDir, aggregatedFileName);
      console.log(`Saving aggregated content to ${aggregatedFilePath}`); // Debug logging
  
      const paragraphs = [];
      const links = await getLinks(url);
  
      for (const link of links) {
        try {
          const response = await fetchWithRetry(link);
          const html = response.data;
          const $ = cheerio.load(html);
  
          $('body').find('p, span, div, li, h1, h2, h3, h4, h5, h6, a').each((idx, element) => {
            const text = $(element).text().trim();
            if (text) {
              paragraphs.push(text); // Add to the main paragraphs array
            }
          });
        } catch (error) {
          console.error(`Error fetching page (${link}): ${error.message}`);
        }
      }
  
      if (paragraphs.length === 0) {
        return res.status(404).json({ message: 'No content found to save' });
      }
  
      // Write the data to the JSON file
      const fileData = {
        url,
        ipAddress,
        filePath: aggregatedFilePath,
        paragraphs,
        createdAt: new Date()
      };
      fs.writeFileSync(aggregatedFilePath, JSON.stringify(fileData, null, 2));
  
      res.json({ message: 'Data saved successfully', filePath: aggregatedFilePath, paragraphs });
  
    } catch (error) {
      console.error('Error fetching the URL:', error);
      res.status(500).json({ error: 'Failed to fetch the URL' });
    }
  });






 // Function to upload JSON data as a file
 const uploadJsonData = async (filePathdone) => {
    try {
      
        const uploadResult = await fileManager.uploadFile(filePathdone, {
            mimeType: 'application/json',
        });
        return uploadResult.file.uri;
    } catch (error) {
        console.error('Error uploading JSON file:', error);
        throw error;
    }
};

// Function to create a cache with the uploaded file
const createCache = async (fileUri) => {
    try {
        const cacheResult = await cacheManager.create({
            model: 'models/gemini-1.5-flash-001',
            contents: [
                {
                    role: 'user',
                    parts: [
                        {
                            fileData: {
                                fileUri: fileUri,
                                mimeType: 'application/json',
                            },
                        },
                    ],
                },
            ],
        });
        return cacheResult;
    } catch (error) {
        console.error('Error creating cache:', error);
        throw error;
    }
};

// Function to query the cached content
const queryCachedContent = async (cacheResult, query) => {
    try {
        const genAI = new GoogleGenerativeAI(process.env.API_KEY);
        const model = genAI.getGenerativeModelFromCachedContent(cacheResult);
        const result = await model.generateContent(query);
        return result.response.text();
    } catch (error) {
        console.error('Error querying cached content:', error);
        throw error;
    }
};

// Route to handle querying the JSON data
app.post('/query', async (req, res) => {
    try {
        const { query } = req.body;
        const filePathdone = './www-designersx-us-1721905205590-aggregated.json'; // Path to your JSON file
        const fileUri = await uploadJsonData(filePathdone);
        const cacheResult = await createCache(fileUri);
        const summary = await queryCachedContent(cacheResult, query);
        res.json({ summary });
    } catch (error) {
        console.error('Error in /query route:', error);
        res.status(500).json({ error: 'An error occurred while processing your request.', details: error.message });
    }
});




// Scrap API OR Get Url 

// app.post('/scrape', async (req, res) => {
//     let { url } = req.body;

//     if (!url) {
//         return res.status(400).json({ error: 'URL is required' });
//     }
//     if (!url.startsWith('http://') && !url.startsWith('https://')) {
//         url = 'http://' + url;
//     }

//     const baseUrl = new URL(url).origin;
//     const visited = new Set();
//     const queue = [url];
//     const scrapedData = [];

//     const crawlPage = async (url) => {
//         if (visited.has(url)) {
//             return;
//         }
//         visited.add(url);

//         try {
//             const { data } = await axios.get(url);
//             const $ = cheerio.load(data);

//             // Extract Title
//             const title = $('title').text();

//             // Extract Links
//             const links = [];
//             $('a').each((index, element) => {
//                 const href = $(element).attr('href');
//                 if (href && !href.startsWith('javascript:') && !href.startsWith('#')) {
//                     const absoluteHref = new URL(href, baseUrl).href;
//                     if (!visited.has(absoluteHref) && absoluteHref.startsWith(baseUrl)) {
//                         queue.push(absoluteHref);
//                     }
//                     links.push(absoluteHref);
//                 }
//             });

//             // Extract Images
//             const images = [];
//             $('img').each((index, element) => {
//                 const src = $(element).attr('src');
//                 if (src) {
//                     images.push(new URL(src, baseUrl).href);
//                 }
//             });

//             // Extract and Clean Plain Text Content from Body
//             let bodyContent = $('body').clone();

//             // Remove script, style, and other unwanted tags
//             bodyContent.find('script, style, link, noscript').remove();
//             bodyContent = bodyContent.text();

//             // Remove excessive whitespace and unwanted text
//             bodyContent = bodyContent.replace(/\s+/g, ' ').trim();
//             bodyContent = bodyContent.replace(/(?:Skip to content|Home|Contact|About Us|Resources|Careers|Technologies|Works|Services|Blog|Facebook|Twitter|Instagram|LinkedIn|GitHub|etc)/gi, '');

//             const result = {
//                 url,
//                 title,
//                 links,
//                 images,
//                 bodyContent
//             };

//             scrapedData.push(result);
//         } catch (error) {
//             console.error(`Error scraping ${url}:`, error.message);
//         }
//     };

//     while (queue.length > 0) {
//         const currentUrl = queue.shift();
//         await crawlPage(currentUrl);
//     }

//     const jsonContent = JSON.stringify(scrapedData, null, 2);

//     fs.writeFile('scrapedData.json', jsonContent, 'utf8', (err) => {
//         if (err) {
//             console.log('An error occurred while writing JSON Object to File.');
//             return res.status(500).json({ error: 'Error saving file' });
//         }

//         console.log('JSON file has been saved.');
//         res.json({ message: 'Data scraped and saved to scrapedData.json' });
//     });
// });




// query API 

// app.get('/query', (req, res) => {
//     const { query } = req.query;

//     if (!query) {
//         return res.status(400).json({ error: 'Query parameter is required' });
//     }

//     fs.readFile(path.join(__dirname, 'scrapedData.json'), 'utf8', (err, data) => {
//         if (err) {
//             console.log('An error occurred while reading JSON Object from File.');
//             return res.status(500).json({ error: 'Error reading file' });
//         }

//         const jsonData = JSON.parse(data);
//         const tokenizer = new natural.WordTokenizer();
//         const queryTokens = tokenizer.tokenize(query.toLowerCase());

//         // Define a function to calculate match score
//         const getMatchScore = (text) => {
//             if (!text) return 0;
//             const textTokens = tokenizer.tokenize(text.toLowerCase());
//             const intersection = queryTokens.filter(token => textTokens.includes(token));
//             return intersection.length / queryTokens.length;
//         };

//         // Define a threshold for match score
//         const matchThreshold = 0.1;

//         const filteredResult = {
//             title: getMatchScore(jsonData.title) > matchThreshold ? jsonData.title : null,
//             metaTags: Object.fromEntries(
//                 Object.entries(jsonData.metaTags).filter(([key, value]) => getMatchScore(value) > matchThreshold)
//             ),
//             links: jsonData.links.filter(link => getMatchScore(link) > matchThreshold),
//             images: jsonData.images.filter(src => getMatchScore(src) > matchThreshold),
//             plainTextContent: getMatchScore(jsonData.plainTextContent) > matchThreshold ? jsonData.plainTextContent : null
//         };

//         res.json(filteredResult);
//     });
// });



app.listen(port, () => {
    console.log(`Example app listening on port ${port}`);
  });