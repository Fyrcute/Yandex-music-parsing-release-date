// ==UserScript==
// @name         Яндекс.Музыка — Дата выпуска трека и альбома
// @namespace    http://tampermonkey.net/
// @version      5.5
// @description  Дата на карточках и треках.
// @author       Пользователь
// @match        https://music.yandex.ru/*
// @grant        GM.xmlHttpRequest
// @connect      api.genius.com
// ==/UserScript==

(function () {
    'use strict';

    console.log('[Yandex Music] Скрипт запущен: v5.5 (с исправлением поиска по автору альбома)');

    function fuzzyMatch(str1, str2) {
        const clean = s => s.toLowerCase().replace(/[^a-zа-яё0-9]/g, '');
        const c1 = clean(str1);
        const c2 = clean(str2);
        return c1.includes(c2) || c2.includes(c1) || levenshtein(c1, c2) < 3;
    }

    function levenshtein(a, b) {
        const matrix = Array(b.length + 1).fill().map(() => Array(a.length + 1).fill(0));
        for (let i = 0; i <= a.length; i++) matrix[0][i] = i;
        for (let j = 0; j <= b.length; j++) matrix[j][0] = j;
        for (let j = 1; j <= b.length; j++) {
            for (let i = 1; i <= a.length; i++) {
                const cost = a[i - 1] === b[j - 1] ? 0 : 1;
                matrix[j][i] = Math.min(
                    matrix[j - 1][i] + 1,
                    matrix[j][i - 1] + 1,
                    matrix[j - 1][i - 1] + cost
                );
            }
        }
        return matrix[b.length][a.length];
    }

    function findElementByClassPart(partial) {
        return document.querySelector(`[class*="${partial}"]`);
    }

    function formatGeniusDate(isoDate) {
        const months = [
            'января', 'февраля', 'марта', 'апреля', 'мая', 'июня',
            'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'
        ];
        const d = new Date(isoDate);
        if (isNaN(d.getTime())) return isoDate;
        return `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`;
    }

    let albumArtistName = null;

    function getAlbumArtistName() {
        const artistLink = [...document.querySelectorAll('a')]
            .find(a => a.href && a.href.includes('/artist') && !a.href.includes('/genre') && a.textContent.trim().length > 1);
        return artistLink ? artistLink.textContent.trim() : null;
    }

    function updateAlbumArtist() {
        if (location.pathname.startsWith('/album/') || location.pathname.startsWith('/single/')) {
            const name = getAlbumArtistName();
            if (name && name !== albumArtistName) {
                albumArtistName = name;
                console.log('[Album Artist] Обновлён автор альбома:', albumArtistName);
            }
        } else {
            albumArtistName = null; 
        }
    }

    function addReleaseDateBelowTitle(trackEl) {
    const titleContainer = trackEl.querySelector('.Meta_titleContainer__gDuXr') ||
                          trackEl.querySelector('.PagePlaylistTrack_titleContainer__');
    if (!titleContainer || titleContainer.querySelector('.track-release-date-badge')) return;

    const titleEl = titleContainer.querySelector('[class*="Meta_title__"]') ||
                    trackEl.querySelector('[class*="PagePlaylistTrack_title"]');
    const artistEl = trackEl.querySelector('[class*="Meta_artistCaption__"]') ||
                     trackEl.querySelector('[class*="PagePlaylistTrack_artist"]');

    if (!titleEl) return; 

    const title = titleEl.textContent.trim();
    const trackArtist = artistEl ? artistEl.textContent.trim() : null;

    console.log('[Track] Обработка:', title, '—', trackArtist);

    const dateBadge = document.createElement('div');
    dateBadge.className = 'track-release-date-badge';
    dateBadge.style.fontSize = '12px';
    dateBadge.style.color = '#aaa';
    dateBadge.style.marginLeft = '8px';
    dateBadge.style.overflow = 'hidden';
    dateBadge.style.textOverflow = 'ellipsis';
    dateBadge.style.fontFamily = 'sans-serif';
    dateBadge.style.whiteSpace = 'nowrap';
    dateBadge.textContent = '🔍 ищем...';

    titleContainer.appendChild(dateBadge);

    const accessToken = 'ВАШ ТОКЕН';

    const searchArtist = albumArtistName || trackArtist || '';
    const query = encodeURIComponent(`${title} ${searchArtist}`);
    const url = `https://api.genius.com/search?q=${query}&access_token=${accessToken}`;

    GM.xmlHttpRequest({
        method: 'GET',
        url: url,
        headers: { 'Accept': 'application/json' },
        onload: function (response) {
            try {
                const data = JSON.parse(response.responseText);
                const hits = data.response?.hits || [];

                let bestMatch = null;
                let bestScore = 0;

                hits.forEach(hit => {
                    if (hit.type !== 'song') return;
                    const result = hit.result;
                    const songTitle = result.title || '';
                    const songArtist = result.primary_artist?.name || '';

                    const titleScore = fuzzyMatch(title, songTitle) ? 1 : 0;
                    const artistScore = fuzzyMatch(searchArtist, songArtist) ? 1 : 0;
                    const totalScore = titleScore + artistScore;

                    if (totalScore > bestScore) {
                        bestScore = totalScore;
                        bestMatch = result;
                    }
                });

                if (!bestMatch && trackArtist && searchArtist !== trackArtist) {
                    const fallbackQuery = encodeURIComponent(`${title} ${trackArtist}`);
                    const fallbackUrl = `https://api.genius.com/search?q=${fallbackQuery}&access_token=${accessToken}`;
                    GM.xmlHttpRequest({
                        method: 'GET',
                        url: fallbackUrl,
                        headers: { 'Accept': 'application/json' },
                        onload: function (fallbackResponse) {
                            try {
                                const fallbackData = JSON.parse(fallbackResponse.responseText);
                                const fallbackHits = fallbackData.response?.hits || [];

                                fallbackHits.forEach(fallbackHit => {
                                    if (fallbackHit.type !== 'song') return;
                                    const fallbackResult = fallbackHit.result;
                                    const fallbackSongTitle = fallbackResult.title || '';
                                    const fallbackSongArtist = fallbackResult.primary_artist?.name || '';

                                    const fallbackTitleScore = fuzzyMatch(title, fallbackSongTitle) ? 1 : 0;
                                    const fallbackArtistScore = fuzzyMatch(trackArtist, fallbackSongArtist) ? 1 : 0;
                                    const fallbackTotalScore = fallbackTitleScore + fallbackArtistScore;

                                    if (fallbackTotalScore > bestScore) {
                                        bestScore = fallbackTotalScore;
                                        bestMatch = fallbackResult;
                                    }
                                });
                            } catch (e) {
                                console.error('[Genius] Ошибка резервного запроса:', e);
                            }
                        },
                        onerror: () => {
                            console.error('[Genius] Ошибка резервного запроса');
                        }
                    });
                }

                if (!bestMatch) {
                    dateBadge.textContent = 'не найдено';
                    return;
                }

                const releaseDate = bestMatch.release_date_for_display;
                if (releaseDate) {
                    const formatted = formatGeniusDate(releaseDate);
                    dateBadge.textContent = formatted;
                    dateBadge.title = `Дата выпуска: ${releaseDate}`;
                } else {
                    dateBadge.textContent = 'без даты';
                }
            } catch (e) {
                console.error('[Genius] Ошибка парсинга:', e);
                dateBadge.textContent = 'ошибка';
            }
        },
        onerror: () => {
            dateBadge.textContent = 'нет связи';
        }
    });
}

    function injectAlbumReleaseDate() {
        const titleEl = findElementByClassPart('PageHeaderTitle_title__');
        const yearEl = findElementByClassPart('PageHeaderAlbumMeta_year__');

        if (!titleEl || !yearEl) return;

        const albumTitle = titleEl.textContent.trim();
        const currentYear = yearEl.textContent.trim();

        const artistName = albumArtistName || getAlbumArtistName();
        if (!artistName || !albumTitle) return;

        if (yearEl.hasAttribute('data-genius-locked')) return;

        console.log('[Album] Обработка:', albumTitle, '—', artistName);

        const accessToken = 'R_qLLYTgPhAO9rnJw1F-xKsQ9sqOY0y-Xo6v3z6kGVIN7FR3fi7J3XD7spsCzNQs';
        const query = encodeURIComponent(`${albumTitle} ${artistName}`);
        const url = `https://api.genius.com/search?q=${query}&access_token=${accessToken}`;

        GM.xmlHttpRequest({
            method: 'GET',
            url: url,
            headers: { 'Accept': 'application/json' },
            onload: function (response) {
                try {
                    const data = JSON.parse(response.responseText);
                    const hits = data.response?.hits || [];

                    let bestMatch = null;
                    let bestScore = 0;

                    hits.forEach(hit => {
                        if (hit.type !== 'song') return;
                        const result = hit.result;
                        const albumName = result.album?.name || '';
                        const artistNameMatch = result.primary_artist?.name || '';

                        let score = 0;
                        if (fuzzyMatch(artistNameMatch, artistName)) score += 2;
                        if (fuzzyMatch(albumName, albumTitle)) score += 3;

                        if (score > bestScore) {
                            bestScore = score;
                            bestMatch = result;
                        }
                    });

                    if (!bestMatch || !bestMatch.album) {
                        console.log('[Genius] Альбом не найден');
                        return;
                    }

                    const releaseDate = bestMatch.album.release_date_for_display || bestMatch.release_date_for_display;
                    if (!releaseDate) return;

                    const formattedDate = formatGeniusDate(releaseDate);

                    yearEl.setAttribute('data-genius-locked', 'true');
                    yearEl.setAttribute('data-original-year', currentYear);
                    yearEl.setAttribute('data-release-date', releaseDate);

                    const updateText = () => {
                        yearEl.textContent = `${currentYear} (${formattedDate})`;
                        yearEl.title = `Дата выпуска: ${releaseDate}`;
                    };
                    updateText();

                    const observer = new MutationObserver(() => {
                        if (!yearEl.hasAttribute('data-genius-locked')) return;
                        if (yearEl.textContent !== `${currentYear} (${formattedDate})`) {
                            updateText();
                        }
                    });
                    observer.observe(yearEl, { childList: true, subtree: true });
                } catch (e) {
                    console.error('[Genius] Ошибка:', e);
                }
            },
            onerror: (err) => {
                console.error('[Genius] Ошибка запроса:', err);
            }
        });
    }

    function addDateToAlbumCard(card) {
        const titleLink = card.querySelector('.AlbumCard_titleLink__u_WLG');
        const artistLink = card.querySelector('.AlbumCard_artistLink__uPR_2');
        const controlsContainer = card.querySelector('.AlbumCard_controls__yuO40');

        if (!titleLink || !artistLink || !controlsContainer || card.querySelector('.album-card-date-badge')) return;

        const albumTitle = titleLink.textContent.trim();
        const artistName = artistLink.textContent.trim();

        console.log('[AlbumCard] Обработка:', albumTitle, '—', artistName);

        const dateBadge = document.createElement('div');
        dateBadge.className = 'album-card-date-badge';
        dateBadge.style.fontSize = '12px';
        dateBadge.style.color = '#aaa';
        dateBadge.style.margin = '4px 0 0 0';
        dateBadge.style.padding = '0 8px';
        dateBadge.style.textAlign = 'center';
        dateBadge.style.whiteSpace = 'nowrap';
        dateBadge.style.overflow = 'hidden';
        dateBadge.style.textOverflow = 'ellipsis';
        dateBadge.style.fontFamily = 'sans-serif';
        dateBadge.textContent = '🔍 ищем...';

        controlsContainer.parentNode.insertBefore(dateBadge, controlsContainer.nextSibling);

        const accessToken = 'R_qLLYTgPhAO9rnJw1F-xKsQ9sqOY0y-Xo6v3z6kGVIN7FR3fi7J3XD7spsCzNQs';
        const query = encodeURIComponent(`${albumTitle} ${artistName}`);
        const url = `https://api.genius.com/search?q=${query}&access_token=${accessToken}`;

        GM.xmlHttpRequest({
            method: 'GET',
            url: url,
            headers: { 'Accept': 'application/json' },
            onload: function (response) {
                try {
                    const data = JSON.parse(response.responseText);
                    const hits = data.response?.hits || [];

                    let bestMatch = null;
                    let bestScore = 0;

                    hits.forEach(hit => {
                        if (hit.type !== 'song') return;
                        const result = hit.result;
                        const albumName = result.album?.name || '';
                        const artistNameMatch = result.primary_artist?.name || '';

                        let score = 0;
                        if (fuzzyMatch(artistNameMatch, artistName)) score += 2;
                        if (fuzzyMatch(albumName, albumTitle)) score += 3;

                        if (score > bestScore) {
                            bestScore = score;
                            bestMatch = result;
                        }
                    });

                    if (!bestMatch) {
                        dateBadge.textContent = 'не найдено';
                        return;
                    }

                    const releaseDate = bestMatch.album?.release_date_for_display || bestMatch.release_date_for_display;
                    if (releaseDate) {
                        const formatted = formatGeniusDate(releaseDate);
                        dateBadge.textContent = formatted;
                        dateBadge.title = `Дата выпуска: ${releaseDate}`;
                    } else {
                        dateBadge.textContent = 'без даты';
                    }
                } catch (e) {
                    dateBadge.textContent = 'ошибка';
                }
            },
            onerror: () => {
                dateBadge.textContent = 'нет связи';
            }
        });
    }

    const observer = new MutationObserver(() => {
        updateAlbumArtist();
        document.querySelectorAll('.CommonTrack_root__i6shE, .PagePlaylistTrack_track__').forEach(addReleaseDateBelowTitle);
        if (location.pathname.startsWith('/album/') || location.pathname.startsWith('/single/')) {
            injectAlbumReleaseDate();
        }
        document.querySelectorAll('.AlbumCard_root__vP6k4').forEach(addDateToAlbumCard);
    });

    setTimeout(() => {
        updateAlbumArtist();
        observer.observe(document.body, { childList: true, subtree: true });
    }, 1000);


    setInterval(() => {
        updateAlbumArtist();
        document.querySelectorAll('.CommonTrack_root__i6shE, .PagePlaylistTrack_track__').forEach(addReleaseDateBelowTitle);
        if (location.pathname.startsWith('/album/') || location.pathname.startsWith('/single/')) {
            injectAlbumReleaseDate();
        }
        document.querySelectorAll('.AlbumCard_root__vP6k4').forEach(addDateToAlbumCard);
    }, 2000);
})();
