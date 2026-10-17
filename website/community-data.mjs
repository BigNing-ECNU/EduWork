// Build-time public GitHub metadata. Credentials never enter the website output.
export const repository = 'ECNU/EduWork';

export function selectDownloads(release) {
  if (release.draft || release.prerelease || !/^v\d+\.\d+\.\d+$/.test(release.tag_name)) {
    throw new Error('Expected a published stable desktop release');
  }
  const version = release.tag_name.slice(1);
  return [
    `EduWork-${version}-windows-x64-setup.zip`,
    `EduWork-${version}-macos-arm64-electron.dmg`,
  ].map(name => {
    const matches = release.assets.filter(asset => asset.name === name);
    const asset = matches[0];
    const expected = `https://github.com/${repository}/releases/download/${release.tag_name}/${name}`;
    if (matches.length !== 1 || asset.state !== 'uploaded' || !(asset.size > 0) || asset.browser_download_url !== expected) {
      throw new Error(`Missing or invalid stable download: ${name}`);
    }
    return { name, url: asset.browser_download_url, size: asset.size };
  });
}

export function starHistory(stars) {
  const counts = new Map();
  for (const star of stars) {
    if (!Number.isFinite(Date.parse(star.starred_at))) throw new Error('Invalid Stargazer timestamp');
    const day = star.starred_at.slice(0, 10);
    counts.set(day, (counts.get(day) || 0) + 1);
  }
  let total = 0;
  return [...counts].sort(([a], [b]) => a.localeCompare(b)).map(([date, count]) => ({ date, stars: total += count }));
}

async function api(endpoint, accept = 'application/vnd.github+json') {
  const headers = { Accept: accept, 'X-GitHub-Api-Version': '2022-11-28', 'User-Agent': 'EduWork-project-website' };
  if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const response = await fetch(`https://api.github.com/repos/${repository}${endpoint ? '/' + endpoint : ''}`, {
        headers, signal: AbortSignal.timeout(30000),
      });
      if (!response.ok) throw new Error(`GitHub ${endpoint}: HTTP ${response.status}`);
      return await response.json();
    } catch (error) {
      if (attempt === 2) throw error;
      await new Promise(resolve => setTimeout(resolve, 1000 * (attempt + 1)));
    }
  }
}

export async function fetchCommunity() {
  const [repo, release] = await Promise.all([api(''), api('releases/latest')]);
  const assets = selectDownloads(release);
  const stars = [];
  for (let page = 1; ; page++) {
    const batch = await api(`stargazers?per_page=100&page=${page}`, 'application/vnd.github.star+json');
    stars.push(...batch);
    if (batch.length < 100) break;
  }
  return {
    repository, url: repo.html_url, fetchedAt: new Date().toISOString(), stars: repo.stargazers_count,
    history: starHistory(stars),
    historyNote: '根据当前仍在关注项目的用户的 starred_at 汇总，已取消的 Star 不在历史数据内。',
    release: { tag: release.tag_name, url: release.html_url, publishedAt: release.published_at, assets },
  };
}
