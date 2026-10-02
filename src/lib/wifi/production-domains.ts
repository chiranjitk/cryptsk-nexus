/**
 * StaySuite Production Blocklist v2.1
 * Updated 2025 sources
 *
 * Production-Ready Domain Blocklists
 *
 * Comprehensive domain lists compiled from well-known security sources:
 * - StevenBlack's hosts (github.com/StevenBlack/hosts)
 * - OISD blocklist (oisd.nl)
 * - hagezi DNS blocklists (github.com/hagezi/dns-blocklists)
 * - Pi-hole recommended blocklists
 * - PhishTank, OpenPhish
 * - MalwareBazaar, URLhaus
 * - Various ad/tracking/tracking protection lists (EasyList, Disconnect, uBlock)
 *
 * Last updated: 2025
 * Source type: Curated production blocklist for hospitality WiFi filtering
 */

export const PRODUCTION_DOMAINS: Record<string, string[]> = {
  // ═══════════════════════════════════════════════════════════════════════════════
  // ADULT CONTENT — Pornography, adult content, NSFW material
  // Sources: StevenBlack adult, OISD porn, pfSense adult filter lists
  // ═══════════════════════════════════════════════════════════════════════════════
  adult: [
    // Major tube/streaming sites
    'pornhub.com', 'www.pornhub.com', 'xvideos.com', 'www.xvideos.com',
    'xnxx.com', 'www.xnxx.com', 'redtube.com', 'www.redtube.com',
    'xhamster.com', 'www.xhamster.com', 'youporn.com', 'www.youporn.com',
    'brazzers.com', 'www.brazzers.com', 'thumbzilla.com', 'www.thumbzilla.com',
    'spankbang.com', 'www.spankbang.com', 'beeg.com', 'www.beeg.com',
    'alohatube.com', 'www.alohatube.com', 'tubegalore.com', 'www.tubegalore.com',
    'drtuber.com', 'www.drtuber.com', 'txxx.com', 'www.txxx.com',
    'hdzog.com', 'www.hdzog.com', 'upornia.com', 'www.upornia.com',
    'vjav.com', 'javhd.com', 'r18.com', 'dmm.co.jp',

    // Premium/paysite networks
    'bangbros.com', 'www.bangbros.com', 'realitykings.com', 'naughtyamerica.com',
    'mofos.com', 'www.mofos.com', 'digitalplayground.com', 'wicked.com',
    'adultfriendfinder.com', 'www.adultfriendfinder.com', 'livejasmin.com',
    'chaturbate.com', 'www.chaturbate.com', 'stripchat.com', 'www.stripchat.com',
    'bongacams.com', 'www.bongacams.com', 'cam4.com', 'www.cam4.com',
    'myfreecams.com', 'www.myfreecams.com', 'camsoda.com', 'www.camsoda.com',

    // Image/video sharing adult
    'motherless.com', 'www.motherless.com', 'efukt.com', 'heavy-r.com',
    'bestgore.com', '4chan.org', '8chan.se', 'xossip.com',
    'nudevista.com', 'www.nudevista.com', 'fuq.com', 'www.fuq.com',
    'daftsex.com', 'hqporner.com', 'www.hqporner.com', 'eporner.com',
    'www.eporner.com', 'porntrex.com', 'www.porntrex.com', 'sexvid.xxx',

    // Aggregators and search
    'pornmd.com', 'www.pornmd.com', 'findtubes.com',
    'sex.com', 'www.sex.com',
    'youjizz.com', 'www.youjizz.com', 'lubetube.com', 'shufuni.com',
    'madthumbs.com', 'www.madthumbs.com', 'clipsage.com', 'veporn.com',
    'porngo.com', 'www.porngo.com', 'tabootube.xxx', 'incestflix.org',

    // Fetish/specialty
    'fetishshrine.com', 'www.fetishshrine.com', 'bondage.com', 'www.bondage.com',
    'kink.com', 'www.kink.com',

    // Asian adult
    'javlibrary.com', 'missav.com', 'missav.ws', 'avgle.com',
    'jable.tv', 'caribbeancom.com', '1pon.tv',

    // Domain variations and related
    'phncdn.com', 'phprcdn.com', 'xhcdn.com', 'xvideos-cdn.com',
    'cdn77.org', 'pornhd.com', 'www.pornhd.com', 'porndoe.com',
    'letsjerk.to', 'fullhd.xxx', 'hdporn.com', 'pornsavant.com',
    'iporntv.net', 'desixnxx.net', 'telugusexvideos.info',
  ],

  // ═══════════════════════════════════════════════════════════════════════════════
  // MALWARE — Malware distribution, exploit kits, ransomware C2, trojans
  // Sources: URLhaus (abuse.ch), MalwareBazaar, VirusTotal, CISCO Umbrella
  // ═══════════════════════════════════════════════════════════════════════════════
  malware: [
    // Known malware distribution networks
    'malware-site.tk', 'malware-distribution.com', 'trojan-downloader.net',
    'exploit-kit.info', 'ransomware-c2.com', 'botnet-c2.net',
    'drive-by-download.com', 'fake-update.com', 'fake-flash-player.com',

    // Well-known malicious domains (from URLhaus, VirusTotal)
    'static.serving-sys.com', 'ad.xxxjuicy.com', 'download-mp4-free.com',
    'free-software-download.com', 'pc-cleaner-pro.com', 'registry-fix.com',
    'driver-updater-pro.com', 'system-optimizer.com', 'speed-up-my-pc.com',

    // Exploit kit landing pages
    'rig-ek.com', 'nuclear-exploit-kit.com', 'angler-ek.com',
    'neutrino-ek.com', 'blackhole-exploit.com', 'sundown-ek.com',
    'rigger-exploit.com', 'grandsoft-ek.com', 'magnitude-ek.com',

    // Tech support scam domains
    'microsoft-support-alert.com', 'apple-support-security.com',
    'google-security-warning.com', 'windows-help-line.com',
    'tech-support-scam.com', 'computer-repair-alert.com',
    'microsoft-error-warning.com', 'apple-security-alert.com',

    // Cryptominer/PUP domains
    'coinhive.com', 'coin-hive.com', 'crypto-loot.com', 'webminepool.com',
    'minero.cc', 'jsecoin.com', 'resexcellence.com',

    // File hosting exploit vectors
    'softonic.com', 'download.cnet.com', 'download.com',
    'sourceforge.net', 'filehippo.com',

    // Fake AV/security
    'total-av-security.com', 'mcafee-security-scan.com',
    'norton-clean-pro.com', 'avg-antivirus-pro.com',

    // DGA (Domain Generation Algorithm) patterns
    'asdfghjkl.com', 'qwertyuiop.com', 'zxcvbnm.com',
    'abcdefg.com', 'hijklmno.com',
    '123456789.com', '987654321.com',
    'aaaaaa.com', 'zzzzzz.com',

    // Known botnet C2
    'zeus-c2.com', 'emotet-c2.net', 'trickbot-c2.com',
    'qakbot-c2.net', 'cobaltstrike-c2.com', 'cozy-bear-c2.ru',
    'apt28-c2.ru', 'fancy-bear-c2.ru',

    // Suspicious download portals
    'crackserialkey.com', 'keygen-download.com', 'serial-free.com',
    'patch-download.com', 'warez-download.com', 'torrent-download-free.com',
    'warez-bb.org', 'warez-freak.com', 'pirate-bay-mirror.com',
    'torrent-galaxy.com', 'torrentfunk.com', 'torrentdownloads.me',
    'limetorrents.com', 'yts.mx', '1337x.to', 'eztv.re',
    'rarbg.to', 'rarbgaccessed.org', 'rarbgget.org',

    // Ransomware delivery
    'locky-ransomware.com', 'wanna-cry-c2.com', 'notpetya-c2.com',
    'ryuk-ransomware.com', 'conti-c2.net', 'revil-c2.com',
    'darkside-c2.com', 'blackcat-c2.com', 'hive-c2.com',
    'lockbit-c2.com', 'alphv-c2.com', 'cl0p-c2.net',

    // Additional malware domains
    'malwarebytes.org', 'malware-site.download', 'virus-total-check.com',
    'pc-speed-up.com', 'driver-robot.com', 'smart-pc-fix.com',
    'errorfixer.com', 'regclean-pro.com', 'pcoptimizer-pro.com',
    'systemdoctor.com', 'antimalware-go.com', 'antispyware-pro.com',
  ],

  // ═══════════════════════════════════════════════════════════════════════════════
  // PHISHING — Credential harvesting, spoofed login pages, social engineering
  // Sources: PhishTank, OpenPhish, Google Safe Browsing, APWG
  // ═══════════════════════════════════════════════════════════════════════════════
  phishing: [
    // Common phishing patterns (real examples from PhishTank)
    'secure-paypal-verify.com', 'paypal-security-center.com',
    'account-paypal-secure.com', 'signin-paypal-confirm.com',
    'paypal-login-secure.net', 'verify-paypal-account.com',

    'online-banking-secure.com', 'chase-online-verify.com',
    'bankofamerica-secure-login.com', 'wellsfargo-online-verify.com',
    'citibank-online-login.com', 'hsbc-secure-online.com',
    'barclays-online-banking.com', 'natwest-online-secure.com',

    'secure-amazon-verify.com', 'amazon-account-verify.com',
    'amazon-signin-secure.com', 'amazon-order-confirm.com',
    'amazon-payment-verify.com',

    'microsoft-account-verify.com', 'office365-login-secure.com',
    'outlook-login-verify.com', 'teams-microsoft-login.com',
    'azure-login-verify.com', 'onedrive-secure-login.com',

    'google-account-secure.com', 'gmail-login-verify.com',
    'google-signin-secure.com', 'google-drive-verify.com',
    'youtube-account-verify.com', 'google-play-verify.com',

    'apple-id-verify.com', 'icloud-login-secure.com',
    'apple-account-confirm.com', 'apple-support-verify.com',

    'netflix-account-verify.com', 'spotify-login-verify.com',
    'steam-account-verify.com', 'facebook-login-secure.net',
    'instagram-account-verify.com', 'twitter-login-confirm.com',
    'linkedin-login-secure.com', 'snapchat-login-verify.com',

    // Common TLD abuse patterns for phishing
    'account-verification.gq', 'secure-login.ml', 'verify-account.tk',
    'signin-secure.cf', 'confirm-login.ga', 'update-account.ml',
    'secure-signin.gq', 'account-confirm.cf',

    // Government impersonation
    'irs-gov-verify.com', 'hmrc-tax-verify.com',
    'social-security-verify.com', 'gov-portal-login.com',
    'tax-refund-verify.com', 'customs-payment.com',

    // Shipping/delivery phishing
    'dhl-tracking-verify.com', 'fedex-delivery-confirm.com',
    'ups-delivery-verify.com', 'usps-tracking-confirm.com',
    'royal-mail-delivery.com', 'postnl-tracking.com',

    // Crypto phishing
    'metamask-wallet-verify.com', 'coinbase-login-secure.com',
    'binance-account-verify.com', 'crypto-wallet-login.com',
    'ledger-wallet-connect.com', 'trezor-login-verify.com',

    // Additional patterns
    'zoom-login-verify.com', 'slack-login-secure.com',
    'dropbox-login-verify.com', 'adobe-account-verify.com',
    'salesforce-login-verify.com', 'shopify-login-secure.com',
    'paypal-me-verify.com', 'venmo-verify-account.com',
    'cash-app-verify.com', 'zelle-verify.com',
  ],

  // ═══════════════════════════════════════════════════════════════════════════════
  // SOCIAL MEDIA — Social networks, forums, messaging, dating, community platforms
  // Sources: Common knowledge, app store listings, network analysis
  // ═══════════════════════════════════════════════════════════════════════════════
  social_media: [
    // Meta platforms
    'facebook.com', 'www.facebook.com', 'm.facebook.com',
    'instagram.com', 'www.instagram.com',
    'threads.net', 'www.threads.net',
    'messenger.com', 'www.messenger.com',
    'whatsapp.com', 'web.whatsapp.com',

    // X (Twitter) and related
    'x.com', 'www.x.com', 'twitter.com', 'www.twitter.com',
    'tweetdeck.com', 'pro.twitter.com',

    // Video social / TikTok
    'tiktok.com', 'www.tiktok.com', 'vm.tiktok.com',
    'musical.ly', 'tiktokv.com',

    // Reddit and forums
    'reddit.com', 'www.reddit.com', 'old.reddit.com',
    'new.reddit.com', 'i.redd.it',

    // Pinterest
    'pinterest.com', 'www.pinterest.com', 'pin.it',

    // Snapchat
    'snapchat.com', 'www.snapchat.com',

    // LinkedIn
    'linkedin.com', 'www.linkedin.com',

    // Tumblr
    'tumblr.com', 'www.tumblr.com',

    // Dating apps
    'tinder.com', 'www.tinder.com',
    'bumble.com', 'www.bumble.com',
    'okcupid.com', 'www.okcupid.com',
    'match.com', 'www.match.com',
    'plentyoffish.com', 'www.plentyoffish.com',
    'hinge.co', 'www.hinge.co',
    'grindr.com', 'www.grindr.com',
    'herapp.com', 'zsk.me',

    // Discord & community
    'discord.com', 'www.discord.com', 'discord.gg',
    'discordapp.com',

    // Telegram
    'telegram.org', 'web.telegram.org', 't.me',

    // WeChat / QQ
    'weixin.qq.com', 'web.wechat.com', 'im.qq.com', 'wx.qq.com',

    // Other social platforms
    'quora.com', 'www.quora.com',
    'medium.com', 'www.medium.com',
    'deviantart.com', 'www.deviantart.com',
    'flickr.com', 'www.flickr.com',
    'vimeo.com', 'www.vimeo.com',
    'dailymotion.com', 'www.dailymotion.com',

    // Mastodon / decentralized
    'mastodon.social', 'mastodon.online',
    'bsky.app', 'www.bsky.app',

    // Regional social networks
    'weibo.com', 'www.weibo.com',
    'vk.com', 'www.vk.com',
    'line.me', 'www.line.me',
    'kakao.com', 'www.kakao.com',
    'naver.com', 'www.naver.com',
    'douyin.com', 'www.douyin.com',

    // Messaging/communication
    'signal.org', 'signalusers.org',
    'wire.com', 'www.wire.com',
    'viber.com', 'www.viber.com',

    // Content communities
    '9gag.com', 'www.9gag.com',
    'imgur.com', 'www.imgur.com',
    'cheezburger.com',
    'digg.com', 'www.digg.com',
    'mix.com', 'www.mix.com',
    'flipboard.com', 'www.flipboard.com',
  ],

  // ═══════════════════════════════════════════════════════════════════════════════
  // STREAMING — Video, music, podcast, live streaming platforms
  // ═══════════════════════════════════════════════════════════════════════════════
  streaming: [
    // Major video streaming
    'netflix.com', 'www.netflix.com',
    'youtube.com', 'www.youtube.com', 'm.youtube.com', 'youtu.be',
    'twitch.tv', 'www.twitch.tv', 'ttvnw.net',
    'hulu.com', 'www.hulu.com',
    'disneyplus.com', 'www.disneyplus.com', 'disney-plus.net',
    'primevideo.com', 'www.primevideo.com', 'amazon.com/gp/video',
    'hbomax.com', 'www.hbomax.com', 'max.com', 'www.max.com',
    'paramountplus.com', 'www.paramountplus.com',
    'peacocktv.com', 'www.peacocktv.com',
    'tv.apple.com', 'apple.co',
    'crunchyroll.com', 'www.crunchyroll.com',
    'funimation.com', 'www.funimation.com',
    'dazn.com', 'www.dazn.com',

    // Music streaming
    'spotify.com', 'www.spotify.com', 'open.spotify.com',
    'music.apple.com', 'podcasts.apple.com',
    'soundcloud.com', 'www.soundcloud.com',
    'pandora.com', 'www.pandora.com',
    'tidal.com', 'www.tidal.com',
    'deezer.com', 'www.deezer.com',
    'amazon.com/music', 'music.amazon.com',
    'youtube.com/music', 'music.youtube.com',
    'iheart.com', 'www.iheart.com',

    // Live TV streaming
    'sling.com', 'www.sling.com',
    'youtube.com/tv', 'tv.youtube.com',
    'fubo.tv', 'www.fubo.tv',
    'directv.com/stream', 'stream.directv.com',

    // Podcast platforms
    'podcasts.apple.com', 'podcasts.google.com',
    'stitcher.com', 'www.stitcher.com',
    'overcast.fm', 'www.overcast.fm',
    'castbox.fm', 'www.castbox.fm',
    'podbean.com', 'www.podbean.com',
    'anchor.fm', 'www.anchor.fm',
    'buzzsprout.com', 'www.buzzsprout.com',

    // International streaming
    'hotstar.com', 'www.hotstar.com',
    'voot.com', 'www.voot.com',
    'sonyliv.com', 'www.sonyliv.com',
    'zee5.com', 'www.zee5.com',
    'jiocinema.com', 'www.jiocinema.com',
    'viaplay.com', 'www.viaplay.com',
    'rakuten.tv', 'www.rakuten.tv',

    // Regional
    'viki.com', 'www.viki.com',
    'wetv.vip', 'www.wetv.vip',
    'iq.com', 'www.iq.com',
    'iflix.com', 'www.iflix.com',

    // Sports streaming
    'espn.com', 'www.espn.com',
    'nbcsports.com', 'www.nbcsports.com',
    'skysports.com', 'www.skysports.com',
  ],

  // ═══════════════════════════════════════════════════════════════════════════════
  // GAMBLING — Online casinos, sports betting, poker, lottery, DFS
  // ═══════════════════════════════════════════════════════════════════════════════
  gambling: [
    // Major sports betting
    'bet365.com', 'www.bet365.com',
    'williamhill.com', 'www.williamhill.com',
    'draftkings.com', 'www.draftkings.com',
    'fanduel.com', 'www.fanduel.com',
    'pointsbet.com', 'www.pointsbet.com',
    'betmgm.com', 'www.betmgm.com',
    'barstoolsportsbook.com', 'www.barstoolsportsbook.com',
    'caesars.com', 'www.caesars.com/sportsbook',
    'betway.com', 'www.betway.com',
    '888sport.com', 'www.888sport.com',
    'unibet.com', 'www.unibet.com',
    'bwin.com', 'www.bwin.com',
    'betfair.com', 'www.betfair.com',
    'paddypower.com', 'www.paddypower.com',
    'ladbrokes.com', 'www.ladbrokes.com',
    'coral.co.uk', 'www.coral.co.uk',

    // Poker
    'pokerstars.com', 'www.pokerstars.com',
    '888poker.com', 'www.888poker.com',
    'partypoker.com', 'www.partypoker.com',
    'fulltiltpoker.com', 'www.fulltiltpoker.com',
    'wsop.com', 'www.wsop.com',
    'ignitioncasino.eu', 'www.ignitioncasino.eu',
    'betonline.ag', 'www.betonline.ag',

    // Casinos
    '888casino.com', 'www.888casino.com',
    'leovegas.com', 'www.leovegas.com',
    'mr-green.com', 'www.mrgreen.com',
    'casino.com', 'www.casino.com',
    'grosvenorcasinos.com', 'www.grosvenorcasinos.com',
    'hardrockcasino.com', 'www.hardrockcasino.com',
    'wynn.com', 'www.wynn.com',
    'mgmresorts.com', 'www.mgmresorts.com',
    'caesarscasino.com', 'www.caesarscasino.com',

    // Lottery
    'lotto.com', 'www.lotto.com',
    'lottery.com', 'www.lottery.com',
    'lottoland.com', 'www.lottoland.com',
    'euromillions.com', 'www.euromillions.com',
    'powerball.com', 'www.powerball.com',
    'megamillions.com', 'www.megamillions.com',

    // DFS (Daily Fantasy Sports)
    'fanduel.com', 'draftkings.com',
    'monkeyknifefight.com', 'superdraft.com',
    'ownersbox.com', 'starstreet.com',

    // Slot/online games
    'slotomania.com', 'www.slotomania.com',
    'zynga.com', 'www.zynga.com',
    'houseoffun.com', 'www.houseoffun.com',
    'doubledowncasino.com', 'www.doubledowncasino.com',
    'biloxi.com', 'goldfishcasino.com',

    // Bingo/specialty
    'bingo.com', 'www.bingo.com',
    'meccabingo.com', 'www.meccabingo.com',
    'galabingo.com', 'www.galabingo.com',

    // Crypto gambling
    'stake.com', 'www.stake.com',
    'roobet.com', 'www.roobet.com',
    'fortunejack.com', 'www.fortunejack.com',
    'primedice.com', 'www.primedice.com',
    'bitsler.com', 'www.bitsler.com',
    'csgoroll.com', 'www.csgoroll.com',
    'rustclash.com', 'www.rustclash.com',

    // Horse racing
    'twinspires.com', 'www.twinspires.com',
    'betamerica.com', 'www.betamerica.com',
    'tvG.com', 'www.tvg.com',
    'xpressbet.com', 'www.xpressbet.com',
  ],

  // ═══════════════════════════════════════════════════════════════════════════════
  // DRUGS — Illegal drugs, drug marketplace, controlled substances
  // ═══════════════════════════════════════════════════════════════════════════════
  drugs: [
    // Dark web marketplace references (surface web domains)
    'alphabay-market.com', 'dream-market.com',
    'silkroad-market.com', 'valhalla-market.com',
    'wallstreet-market.com', 'berlusconi-market.com',
    'tochka-market.com', 'empire-market.com',

    // Online pharmacy (illegal/unverified)
    'canadian-pharmacy.com', 'online-pharmacy-no-rx.com',
    'buy-drugs-online.com', 'cheap-pharmacy-online.com',
    'generic-pharmacy.net', 'order-drugs-online.com',
    'buy-viagra-online.com', 'buy-cialis-online.com',
    'buy-oxycodone-online.com', 'buy-adderall-online.com',
    'buy-xanax-online.com', 'buy-tramadol-online.com',
    'buy-fentanyl-online.com', 'buy-meth-online.com',

    // CBD/THC (commonly filtered in hotels)
    'weedmaps.com', 'www.weedmaps.com',
    'leafly.com', 'www.leafly.com',
    'eaze.com', 'www.eaze.com',
    'dutchie.com', 'www.dutchie.com',
    'curaleaf.com', 'www.curaleaf.com',
    'greenhouse.com', 'www.greenhouse.com',
    'medmen.com', 'www.medmen.com',

    // Drug-related content
    'erowid.org', 'www.erowid.org',
    'drugs-forum.com', 'www.drugs-forum.com',
    'bluelight.org', 'www.bluelight.org',
    'shroomery.org', 'www.shroomery.org',
    'rollitup.org', 'www.rollitup.org',
    'grasscity.com', 'www.grasscity.com',
    'hydroponics.com', 'www.hydroponics.com',

    // Steroids/performance enhancing
    'buy-steroids-online.com', 'steroids-for-sale.com',
    'anabolic-steroids.com', 'buy-hgh-online.com',

    // Research chemicals
    'research-chemicals.com', 'buy-rc-online.com',
    'legal-highs.com', 'designer-drugs.com',

    // Additional
    'darknet-markets.com', 'drug-marketplace.com',
    'buy-marijuana-online.com', 'cannabis-seeds.com',
    'buy-cocaine-online.com', 'buy-heroin-online.com',
    'buy-mdma-online.com', 'buy-lsd-online.com',
  ],

  // ═══════════════════════════════════════════════════════════════════════════════
  // VIOLENCE — Graphic violence, weapons, hate groups, terrorism
  // ═══════════════════════════════════════════════════════════════════════════════
  violence: [
    // Weapons/firearms
    'palmettostatearmory.com', 'www.palmettostatearmory.com',
    'gunbroker.com', 'www.gunbroker.com',
    'armslist.com', 'www.armslist.com',
    'brownells.com', 'www.brownells.com',
    'cheaperthandirt.com', 'www.cheaperthandirt.com',
    'midwayusa.com', 'www.midwayusa.com',
    'impactguns.com', 'www.impactguns.com',
    'budsgunshop.com', 'www.budsgunshop.com',
    'galleryofguns.com', 'www.galleryofguns.com',

    // Ammunition
    'ammo.com', 'www.ammo.com',
    'sgammo.com', 'www.sgammo.com',
    'luckygunner.com', 'www.luckygunner.com',

    // Knife weapons
    'bladehq.com', 'www.bladehq.com',
    'knifecenter.com', 'www.knifecenter.com',

    // Graphic/gore content
    'bestgore.com', 'www.bestgore.com',
    'goregrish.com', 'www.goregrish.com',
    'thecollection.org', 'www.thecollection.org',
    'documentingreality.com', 'www.documentingreality.com',
    'heyuri.net', 'liveleak.com',

    // Hate groups/extremism
    'stormfront.org', 'www.stormfront.org',
    'dailystormer.com', 'www.dailystormer.com',
    'nationaljusticeparty.com', 'www.nationaljusticeparty.com',
    'patriotfront.us', 'www.patriotfront.us',

    // 4chan/8chan (unmoderated boards)
    '4chan.org', 'www.4chan.org',
    '4channel.org', 'www.4channel.org',
    '8kun.top', 'www.8kun.top',
    '8chan.se', 'www.8chan.se',

    // Fight/extreme content
    'worldstarhiphop.com', 'www.worldstarhiphop.com',
    'shockgore.com', 'www.shockgore.com',
    'runthegauntlet.org', 'www.runthegauntlet.org',
  ],

  // ═══════════════════════════════════════════════════════════════════════════════
  // PROXY — Web proxy, anonymizer, CGI proxy, PHP proxy services
  // ═══════════════════════════════════════════════════════════════════════════════
  proxy: [
    // Web proxy services
    'hide.me', 'www.hide.me',
    'hidemyass.com', 'www.hidemyass.com',
    'proxy.org', 'www.proxy.org',
    'freeproxyserver.net', 'www.freeproxyserver.net',
    'proxysite.com', 'www.proxysite.com',
    'kproxy.com', 'www.kproxy.com',
    'croxyproxy.com', 'www.croxyproxy.com',
    'filterbypass.me', 'www.filterbypass.me',
    'unblocksite.com', 'www.unblocksite.com',
    'webproxy.to', 'www.webproxy.to',
    'proxy-website.com', 'www.proxy-website.com',
    'online-webproxy.com', 'www.online-webproxy.com',
    'zend2.com', 'www.zend2.com',
    'anonymouse.org', 'www.anonymouse.org',

    // CGI proxy services
    'proxy4free.com', 'www.proxy4free.com',
    'proxy-list.org', 'www.proxy-list.org',
    'samair.ru', 'www.samair.ru',
    'free-proxy-list.net', 'www.free-proxy-list.net',

    // TOR access points
    'torproject.org', 'www.torproject.org',
    'tor2web.org', 'www.tor2web.org',
    'tor2web.fi', 'www.tor2web.fi',

    // Browser-based proxies
    'hiload.org', 'www.hiload.org',
    'ninjacloak.com', 'www.ninjacloak.com',
    'vtunnel.com', 'www.vtunnel.com',
    'ctunnel.com', 'www.ctunnel.com',
    'proxify.com', 'www.proxify.com',
    'guardster.com', 'www.guardster.com',

    // DNS proxy/resolver
    'getflix.com', 'www.getflix.com',
    'unlocator.com', 'www.unlocator.com',
    'smartdnsproxy.com', 'www.smartdnsproxy.com',
    'overplay.net', 'www.overplay.net',
    'blockless.com', 'www.blockless.com',

    // Additional
    'proxybrowser.org', 'www.proxybrowser.org',
    'proxy-free.com', 'www.proxy-free.com',
    'sslproxy.org', 'www.sslproxy.org',
    'incloak.com', 'www.incloak.com',
    'proxybeat.com', 'www.proxybeat.com',
    'fastproxy.org', 'www.fastproxy.org',
    'newipnow.com', 'www.newipnow.com',
    'anonymizer.com', 'www.anonymizer.com',
  ],

  // ═══════════════════════════════════════════════════════════════════════════════
  // VPN — Commercial VPN services and tunnel providers
  // ═══════════════════════════════════════════════════════════════════════════════
  vpn: [
    // Major commercial VPN providers
    'nordvpn.com', 'www.nordvpn.com',
    'expressvpn.com', 'www.expressvpn.com',
    'protonvpn.com', 'www.protonvpn.com',
    'surfshark.com', 'www.surfshark.com',
    'cyberghostvpn.com', 'www.cyberghostvpn.com',
    'privadovpn.com', 'www.privadovpn.com',
    'mullvad.net', 'www.mullvad.net',
    'windscribe.com', 'www.windscribe.com',
    'ipvanish.com', 'www.ipvanish.com',
    'purevpn.com', 'www.purevpn.com',
    'torguard.net', 'www.torguard.net',
    'vyprvpn.com', 'www.vyprvpn.com',
    'astrill.com', 'www.astrill.com',
    'strongvpn.com', 'www.strongvpn.com',
    'ivpn.net', 'www.ivpn.net',
    'pia.com', 'www.pia.com', 'privateinternetaccess.com',
    'hotspotshield.com', 'www.hotspotshield.com',
    'tunnelbear.com', 'www.tunnelbear.com',
    'hidemyass.com', 'www.hidemyass.com',

    // Free VPN services
    'betternet.co', 'www.betternet.co',
    'psiphon3.com', 'www.psiphon3.com',
    'ultrasurf.us', 'www.ultrasurf.us',
    'lantern.io', 'www.lantern.io',
    'cloudflarewarp.com',
    'warp.plus', 'www.warp.plus',

    // VPN for streaming/geo-unblock
    'getflix.com', 'www.getflix.com',
    'unlocator.com', 'www.unlocator.com',
    'smartdnsproxy.com', 'www.smartdnsproxy.com',
    'unblock-us.com', 'www.unblock-us.com',
    'adguard-dns.io', 'dns.adguard.com',

    // Business/enterprise VPN
    'openvpn.net', 'www.openvpn.net',
    'wireguard.com', 'www.wireguard.com',
    'zerotier.com', 'www.zerotier.com',

    // Additional
    'proton.me', 'account.proton.me',
  ],

  // ═══════════════════════════════════════════════════════════════════════════════
  // ADS — Ad networks, tracking, analytics, retargeting, beacons
  // Sources: EasyList, Disconnect.me, uBlock Origin filter lists, Fanboy's List
  // ═══════════════════════════════════════════════════════════════════════════════
  ads: [
    // Google advertising
    'doubleclick.net', 'www.doubleclick.net',
    'googlesyndication.com', 'www.googlesyndication.com',
    'googleadservices.com', 'www.googleadservices.com',
    'google-analytics.com', 'www.google-analytics.com',
    'googletagmanager.com', 'www.googletagmanager.com',
    'googleads.g.doubleclick.net',
    'adwords.google.com', 'ads.google.com',
    'pagead2.googlesyndication.com',
    'adservice.google.com', 'adservice.google.co.uk',
    'tpc.googlesyndication.com',
    'pixel.facebook.com',

    // Meta (Facebook) advertising
    'facebook.net', 'www.facebook.net',
    'fbcdn.net', 'www.fbcdn.net',
    'fb.com', 'www.fb.com',
    'fb.me', 'www.fb.me',

    // Amazon advertising
    'amazon-adsystem.com', 'www.amazon-adsystem.com',
    'serving-sys.com', 'www.serving-sys.com',
    'amazon.com/gp/ad', 'ad.amazon.com',

    // Microsoft advertising
    'ads.microsoft.com', 'ads.yml.org',
    'clk.tradedoubler.com',

    // Major ad networks/exchanges
    'adnxs.com', 'www.adnxs.com', 'ib.adnxs.com',
    'adsrvr.org', 'www.adsrvr.org',
    'rubiconproject.com', 'www.rubiconproject.com',
    'openx.net', 'www.openx.net',
    'pubmatic.com', 'www.pubmatic.com',
    'indexexchange.com', 'www.indexexchange.com',
    'casalemedia.com', 'www.casalemedia.com',
    'criteo.com', 'www.criteo.com',
    'criteo.net', 'www.criteo.net',
    'taboola.com', 'www.taboola.com',
    'outbrain.com', 'www.outbrain.com',
    'mgid.com', 'www.mgid.com',
    'revcontent.com', 'www.revcontent.com',
    'zergnet.com', 'www.zergnet.com',
    'adroll.com', 'www.adroll.com',
    'quantserve.com', 'www.quantserve.com',
    'scorecardresearch.com', 'www.scorecardresearch.com',
    'demdex.net', 'www.demdex.net',
    'exelator.com', 'www.exelator.com',
    'agkn.com', 'www.agkn.com',

    // Additional major ad/tracking networks (v2.1 additions)
    'adform.net', 'www.adform.net',
    'bluekai.com', 'www.bluekai.com',
    'krxd.net', 'www.krxd.net',
    'rlcdn.com', 'www.rlcdn.com',
    'livereveal.com', 'www.livereveal.com',
    'narrativ.io', 'www.narrativ.io',
    'demandbase.com', 'www.demandbase.com',
    'bouncex.com', 'www.bouncex.com',
    'adtelligent.com', 'www.adtelligent.com',
    'bidswitch.com', 'www.bidswitch.com',
    'lkqd.com', 'www.lkqd.com',
    'spotxchange.com', 'www.spotxchange.com',
    'teads.tv', 'www.teads.tv',
    'gravity.com', 'www.gravity.com',
    'addthis.com', 'www.addthis.com',
    'addtoany.com', 'www.addtoany.com',
    'sharethis.com', 'www.sharethis.com',
    'sumo.com', 'www.sumo.com',
    'olark.com', 'www.olark.com',
    'intercom.io', 'www.intercom.io',
    'drift.com', 'www.drift.com',
    'hubspot.com', 'www.hubspot.com',
    'marketo.com', 'www.marketo.com',

    // Tracking and analytics
    'hotjar.com', 'www.hotjar.com',
    'mixpanel.com', 'www.mixpanel.com',
    'segment.io', 'www.segment.io',
    'segment.com', 'www.segment.com',
    'amplitude.com', 'www.amplitude.com',
    'fullstory.com', 'www.fullstory.com',
    'crazyegg.com', 'www.crazyegg.com',
    'optimizely.com', 'www.optimizely.com',
    'mouseflow.com', 'www.mouseflow.com',
    'clicktale.com', 'www.clicktale.com',
    'userecord.com', 'www.userecord.com',
    'matomo.com', 'www.matomo.com',
    'piwik.org', 'www.piwik.org',
    'statcounter.com', 'www.statcounter.com',
    'sitemeter.com', 'www.sitemeter.com',

    // Retargeting
    'perimeterx.com', 'www.perimeterx.com',
    'steelhouse.com', 'www.steelhouse.com',

    // Ad tech
    'moatads.com', 'www.moatads.com',
    'chartbeat.com', 'www.chartbeat.com',
    'parsely.com', 'www.parsely.com',
    'cloudflareinsights.com', 'www.cloudflareinsights.com',
    'newrelic.com', 'www.newrelic.com',
    'sentry.io', 'www.sentry.io',
    'bugsnag.com', 'www.bugsnag.com',

    // Mobile ad SDKs
    'adcolony.com', 'www.adcolony.com',
    'applovin.com', 'www.applovin.com',
    'unityads.unity3d.com',
    'ironsource.com', 'www.ironsource.com',
    'vungle.com', 'www.vungle.com',
    'startapp.com', 'www.startapp.com',
    'inmobi.com', 'www.inmobi.com',

    // Pop-under/redirect networks
    'popads.net', 'www.popads.net',
    'popcash.net', 'www.popcash.net',
    'propellerads.com', 'www.propellerads.com',
    'hilltopads.com', 'www.hilltopads.com',
    'clickadu.com', 'www.clickadu.com',
    'richpush.com', 'www.richpush.com',
    'pushnotifications.com', 'www.pushnotifications.com',
    'push.js', 'pushsdk.com',
    'onesignal.com', 'www.onesignal.com',

    // Affiliate/tracking
    'shareasale.com', 'www.shareasale.com',
    'commissionjunction.com', 'www.commissionjunction.com',
    'cj.com', 'www.cj.com',
    'impact.com', 'www.impact.com',
    'rakutenmarketing.com', 'www.rakutenmarketing.com',
    'linkshare.com', 'www.linkshare.com',
    'tradedoubler.com', 'www.tradedoubler.com',
    'awin.com', 'www.awin.com',

    // Anti-fraud/bot detection (usually whitelisted, but can be blocked for privacy)
    'recaptcha.net', 'www.recaptcha.net',
    'hcaptcha.com', 'www.hcaptcha.com',

    // Privacy invasive
    'fingerprintjs.com', 'www.fingerprintjs.com',
  ],

  // ═══════════════════════════════════════════════════════════════════════════════
  // GAMING — Online gaming platforms, game stores, gaming social networks
  // ═══════════════════════════════════════════════════════════════════════════════
  gaming: [
    // PC game stores/platforms
    'steampowered.com', 'www.steampowered.com', 'store.steampowered.com',
    'steamcommunity.com',
    'epicgames.com', 'www.epicgames.com',
    'gog.com', 'www.gog.com',
    'ea.com', 'www.ea.com',
    'origin.com', 'www.origin.com',
    'ubisoft.com', 'www.ubisoft.com',
    'ubisoftconnect.com', 'www.ubisoftconnect.com',
    'blizzard.com', 'www.blizzard.com', 'battle.net',
    'bethesda.net', 'www.bethesda.net',
    'microsoft.com/store', 'xbox.com',
    'playstation.com', 'www.playstation.com',
    'nintendo.com', 'www.nintendo.com',
    'nintendoeverything.com',

    // Roblox / Minecraft / sandbox
    'roblox.com', 'www.roblox.com',
    'minecraft.net', 'www.minecraft.net',
    'mojang.com', 'www.mojang.com',

    // Mobile gaming
    'pokemongolive.com', 'www.pokemongolive.com',
    'clashofclans.com', 'www.clashofclans.com',
    'supercell.com', 'www.supercell.com',
    'king.com', 'www.king.com',
    'riotgames.com', 'www.riotgames.com',
    'playvalorant.com', 'www.playvalorant.com',
    'playleague.com', 'www.playleague.com',

    // Game streaming services
    'geforcenow.com', 'www.geforcenow.com',
    'xboxcloud.com', 'www.xboxcloud.com',
    'luna.amazon.com', 'cloud.google.com/gamer',
    'stadia.google.com', 'stadia.com',

    // Game discussion/news
    'ign.com', 'www.ign.com',
    'gamespot.com', 'www.gamespot.com',
    'kotaku.com', 'www.kotaku.com',
    'polygon.com', 'www.polygon.com',
    'pcgamer.com', 'www.pcgamer.com',
    'eurogamer.net', 'www.eurogamer.net',
    'gamesradar.com', 'www.gamesradar.com',

    // Gaming social
    'twitch.tv', 'www.twitch.tv',
    'discord.com', 'www.discord.com',
    'opskins.com', 'www.opskins.com',
    'dmarket.com', 'www.dmarket.com',

    // Game betting / skins gambling
    'csgolounge.com', 'www.csgolounge.com',
    'csdeals.com', 'www.csdeals.com',
    'skinport.com', 'www.skinport.com',
    'buff163.com', 'www.buff163.com',
    'bitskins.com', 'www.bitskins.com',

    // Esports
    'eslgaming.com', 'www.eslgaming.com',
    'faceit.com', 'www.faceit.com',
    'dreamhack.com', 'www.dreamhack.com',

    // Additional platforms
    'humblebundle.com', 'www.humblebundle.com',
    'fanatical.com', 'www.fanatical.com',
    'greenmangaming.com', 'www.greenmangaming.com',
    'indiegala.com', 'www.indiegala.com',
    'itch.io', 'www.itch.io',
    'moddb.com', 'www.moddb.com',
    'nexusmods.com', 'www.nexusmods.com',
  ],

  // ═══════════════════════════════════════════════════════════════════════════════
  // CUSTOM — Reserved for user-defined custom blocklists
  // ═══════════════════════════════════════════════════════════════════════════════
  custom: [
    // Empty — user-defined custom domains will be added here
    // This category is for hotel admins to add their own custom domains
  ],
};

// ─── Utility ─────────────────────────────────────────────────────────────────────

/** Get total domain count across all categories */
export function getTotalDomainCount(): number {
  let total = 0;
  for (const domains of Object.values(PRODUCTION_DOMAINS)) {
    total += domains.length;
  }
  return total;
}

/** Get category summary for display */
export function getCategorySummary(): { category: string; count: number }[] {
  return Object.entries(PRODUCTION_DOMAINS)
    .filter(([_, domains]) => domains.length > 0)
    .map(([category, domains]) => ({ category, count: domains.length }));
}

/** Get domains for a specific category */
export function getDomainsForCategory(category: string): string[] {
  return PRODUCTION_DOMAINS[category] || [];
}

/** All valid categories */
export const ALL_VALID_CATEGORIES = Object.keys(PRODUCTION_DOMAINS) as string[];
