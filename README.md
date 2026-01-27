<div align="center">

![Showcase Card](public/static/twitter-card.webp)
# VOD Archive
A project to archive past VODs from Twitch.

</div>

## About this repo.
This is a project that uses a combination of Baserow and n8n automations to maintain a fully functional VOD archive for Twitch streams, or even other platforms. Complete with:

* Chat Replay
* Game Category Sorting
* Date Sorting
* Keyword Searching

And of course, this project is open source and fully available under the [MIT License](LICENSE) - modify to your hearts content.

## How does it work?
Originally derived from my own [website](https://gitlab.com/rcw.lol/website), which was in itself derived from the [astro-erudite](https://github.com/jktrn/astro-erudite) template, this project removed a lot of the unnecessary junk that was scattered around the website and made VOD archival it's own separate thing.

The project now uses a [Baserow](https://baserow.io) instance to store all of the VOD information. Each time a record is created, updated, or deleted, a webhook is sent to an [n8n](https://n8n.io) instance which handles rebuilding the website, notifying Discord, or any other automation that could be hooked in to this project.

This allows the site to remain static so it can be super fast and responsive to use, and still be easily updated and maintained. And the best part, **all of this** is technically free to host!

## How do I modify this?
Until I make a full guide on how to create the entire system for yourself, you'll have to figure it out and make your own solution if you intend to fork this project. If you find a bug, please report it to me either here on GitLab, or on Discord.

That being said, if you still want to develop this for yourself, it's easy:

```sh
# Clone the repo
git clone https://gitlab.com/rcw.lol/vods

# Install dependencies
cd vod-archive && bun install

# Setup the .env file (you'll have to provide your own keys and such)
cp .env.example .env

# Run the test server
bun dev
```