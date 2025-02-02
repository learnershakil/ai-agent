import axios from "axios";
import * as cheerio from "cheerio"; 
import OpenAI from "openai";

const openai = new OpenAI(process.env.OPENAI_API_KEY);

async function scrapewebpage(url = ""){
    const {data} = await axios.get(url);
    const $ = cheerio.load(data);

    const pageHead = $("head").html();
    const pageBody = $("body").html();

    const internalLinks = [];
    const externalLinks = [];

    $("a").each((_, el) => {
        const link = $(el).attr("href");
        if(link === '/' || link === '#' || link === '') return;
        if(link.startsWith("http") || link.startsWith("https")){
            externalLinks.push(link);
        } else {
            internalLinks.push(link);
        }
    });

    return { head: pageHead, body: pageBody, internalLinks, externalLinks };
}

scrapewebpage("https://learnersarc.live").then(console.log).catch(console.error);