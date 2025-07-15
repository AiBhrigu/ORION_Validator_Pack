import { html, render } from 'lit-html';
import logo from './logo2.svg';
import { AuthClient } from '@dfinity/auth-client';
import { nft_mint } from 'declarations/nft-mint';

class App {
  identity = null;
  principal = null;
  hasAccess = false;
  minting = false;
  works = [];
  worksBlob = [];
  invites = [];
  inviteCode = '';
  inviteInput = '';
  uploadDesc = '';
  uploadUrl = '';
  uploadFile = null;
  uploadFileType = '';
  uploading = false;
  auctionStatus = {};
  bidInput = {};
  loadingWorks = false;
  auctionBids = {};
  showProfile = false;
  showAdminPanel = false; // новое состояние
  userWorks = [];
  userWorksBlob = [];
  userAuctions = [];
  toast = null;
  toastTimeout = null;
  plugConnected = false;
  plugPrincipal = '';
  // Фильтры
  searchText = '';
  filterAuthor = '';
  filterAuction = '';
  // ---
  adminSearchText = '';
  adminFilterAuthor = '';
  adminActionLoading = {}; // tokenId: true/false
  ADMIN_PRINCIPAL = 'aaaaa-aa'; // TODO: заменить на реальный principal админа
  get isAdmin() {
    return this.principal === this.ADMIN_PRINCIPAL;
  }
  // Для фильтрации статусов в админке
  adminFilterStatus = '';

  constructor() {
    this.#render();
  }

  #login = async () => {
    const authClient = await AuthClient.create();
    await authClient.login({
      identityProvider: "https://identity.ic0.app/#authorize",
      onSuccess: async () => {
        this.identity = authClient.getIdentity();
        this.principal = this.identity.getPrincipal().toText();
        this.hasAccess = await this.#checkAccess();
        await this.#loadWorks();
        await this.#loadInvites();
        this.#render();
      },
    });
  };

  #checkAccess = async () => {
    if (!this.principal) return false;
    return await nft_mint.hasPostulate(this.principal);
  };

  #mintPostulate = async () => {
    this.minting = true;
    this.#render();
    try {
      await nft_mint.mintPostulateNFT(this.principal, "SUNRICE POSTULATE");
      this.#showToast('POSTULATE успешно получен!');
    } catch (e) {
      this.#showToast('Ошибка минта POSTULATE', 'error');
    }
    this.hasAccess = await this.#checkAccess();
    this.minting = false;
    this.#render();
  };

  #loadWorks = async () => {
    this.loadingWorks = true;
    this.#render();
    try {
      this.works = await nft_mint.getAllWorks();
      this.worksBlob = await nft_mint.getAllWorksWithBlob();
      for (const w of this.works) {
        this.auctionStatus[w.tokenId] = await nft_mint.getAuction(w.tokenId);
        this.auctionBids[w.tokenId] = await nft_mint.getAuctionBids(w.tokenId);
      }
      for (const w of this.worksBlob) {
        this.auctionStatus[w.tokenId] = await nft_mint.getAuction(w.tokenId);
        this.auctionBids[w.tokenId] = await nft_mint.getAuctionBids(w.tokenId);
      }
    } catch (e) { this.works = []; this.worksBlob = []; }
    this.loadingWorks = false;
    this.#render();
  };

  #uploadWork = async (e) => {
    e.preventDefault();
    this.uploading = true;
    this.#render();
    try {
      if (this.uploadFile) {
        // Загрузка blob
        const arrayBuffer = await this.uploadFile.arrayBuffer();
        const blob = Array.from(new Uint8Array(arrayBuffer));
        await nft_mint.uploadWorkWithBlob(blob, this.uploadDesc, this.uploadFileType);
      } else {
        // Старый режим (по ссылке)
        await nft_mint.uploadWork(this.uploadUrl, this.uploadDesc);
      }
      this.#showToast('Работа успешно загружена!');
      this.uploadDesc = '';
      this.uploadUrl = '';
      this.uploadFile = null;
      this.uploadFileType = '';
      await this.#loadWorks();
      await this.#loadInvites();
    } catch (e) {
      this.#showToast('Ошибка загрузки работы', 'error');
    }
    this.uploading = false;
    this.#render();
  };

  #onFileChange = (e) => {
    const file = e.target.files[0];
    this.uploadFile = file;
    this.uploadFileType = file ? file.type : '';
    this.#render();
  };

  #startAuction = async (tokenId) => {
    await nft_mint.startAuction(tokenId, 24*60*60); // 24h
    await this.#loadWorks();
  };

  #connectPlug = async () => {
    if (window.ic && window.ic.plug) {
      const connected = await window.ic.plug.requestConnect();
      if (connected) {
        this.plugConnected = true;
        this.plugPrincipal = (await window.ic.plug.getPrincipal()).toText();
        this.#showToast('Plug Wallet подключён!');
        this.#render();
      } else {
        this.#showToast('Не удалось подключить Plug', 'error');
      }
    } else {
      this.#showToast('Установите расширение Plug Wallet!', 'error');
    }
  };

  #placeBid = async (tokenId) => {
    const bid = Number(this.bidInput[tokenId] || 0);
    if (!bid) return;
    if (!this.plugConnected) {
      this.#showToast('Сначала подключите Plug Wallet!', 'error');
      return;
    }
    try {
      // Отправка ICP через Plug
      const toPrincipal = '<CANISTER_OR_WALLET_PRINCIPAL>'; // TODO: заменить на адрес для ставок
      const amountE8s = bid * 100_000_000;
      const transferResult = await window.ic.plug.requestTransfer({
        to: toPrincipal,
        amount: amountE8s,
      });
      if (transferResult && transferResult.height) {
        await nft_mint.placeBid(tokenId, bid);
        this.#showToast('Ставка принята!');
        await this.#loadWorks();
      } else {
        this.#showToast('Ошибка перевода ICP', 'error');
      }
    } catch (e) {
      this.#showToast('Ошибка ставки или перевода ICP', 'error');
    }
  };

  #finishAuction = async (tokenId) => {
    try {
      await nft_mint.finishAuction(tokenId);
      this.#showToast('Аукцион завершён!');
      await this.#loadWorks();
    } catch (e) {
      this.#showToast('Ошибка завершения аукциона', 'error');
    }
  };

  #generateInvite = async () => {
    try {
      this.inviteCode = await nft_mint.generateInvite();
      this.#showToast('Инвайт сгенерирован!');
      await this.#loadInvites();
      this.#render();
    } catch (e) {
      this.#showToast('Ошибка генерации инвайта', 'error');
    }
  };

  #useInvite = async (e) => {
    e.preventDefault();
    if (!this.inviteInput) return;
    try {
      await nft_mint.useInvite(this.inviteInput);
      this.#showToast('Инвайт успешно использован!');
      this.inviteInput = '';
      await this.#loadInvites();
      this.#render();
    } catch (e) {
      this.#showToast('Ошибка использования инвайта', 'error');
    }
  };

  #loadInvites = async () => {
    if (!this.principal) return;
    this.invites = await nft_mint.getInvites(this.principal);
    this.#render();
  };

  #loadProfile = async () => {
    if (!this.principal) return;
    this.userWorks = await nft_mint.getUserWorks(this.principal);
    this.userWorksBlob = await nft_mint.getUserWorksWithBlob(this.principal);
    this.userAuctions = await nft_mint.getUserAuctions(this.principal);
    await this.#loadInvites();
    this.#render();
  };

  #showToast = (msg, type = 'success') => {
    this.toast = { msg, type };
    this.#render();
    if (this.toastTimeout) clearTimeout(this.toastTimeout);
    this.toastTimeout = setTimeout(() => {
      this.toast = null;
      this.#render();
    }, 3000);
  };

  #render() {
    let body;
    if (!this.identity) {
      body = html`
        <main>
          <h2>SUNRICE COMMUNITY</h2>
          <button id="login-btn">Войти через Internet Identity</button>
        </main>
      `;
    } else if (!this.hasAccess) {
      body = html`
      <main>
          <h2>Доступ ограничен</h2>
          <p>Вам необходим NFT POSTULATE для входа в арт-сеть.</p>
          <button id="mint-btn" ?disabled=${this.minting}>${this.minting ? 'Минтим...' : 'Получить POSTULATE'}</button>
          <form id="invite-form">
            <input type="text" placeholder="Ввести инвайт-код" .value=${this.inviteInput} @input=${e => { this.inviteInput = e.target.value; }} />
            <button type="submit">Использовать инвайт</button>
        </form>
        </main>
      `;
    }
    else if (this.showProfile) {
      body = html`
        <main>
          <h2>👤 Профиль пользователя</h2>
          <button @click=${() => { this.showProfile = false; this.#render(); }}>← В галерею</button>
          <div style="margin:1em 0;">Principal: <b>${this.principal}</b></div>
          <div style="margin:1em 0;">Статус: ${this.hasAccess ? html`<span style="color:#00ff41">Есть POSTULATE</span>` : html`<span style="color:#ff0041">Нет POSTULATE</span>`}</div>
          <section>
            <h3>Ваши работы</h3>
            <div class="matrix-gallery">
              ${[...this.userWorks, ...this.userWorksBlob].length === 0 ? html`<div>Нет работ</div>` :
                [...this.userWorks, ...this.userWorksBlob].map(w => html`
                  <div class="matrix-card">
                    ${w.fileUrl ? html`<img src="${w.fileUrl}" alt="work" />` :
                      w.contentType && w.contentType.startsWith('image') ? html`<img src="data:${w.contentType};base64,${btoa(String.fromCharCode(...w.file))}" alt="work" />` :
                      html`<a href="data:${w.contentType};base64,${btoa(String.fromCharCode(...w.file))}" download="work_${w.tokenId}">Скачать файл</a>`}
                    <div><b>${w.description}</b></div>
                    <div style="font-size:0.9em;opacity:0.7;">Создано: ${new Date(Number(w.createdAt/1_000_000)).toLocaleString()}</div>
                    <div style="font-size:0.9em;opacity:0.7;">Статус: <b>${w.status ? Object.keys(w.status)[0] : 'unknown'}</b></div>
                  </div>
                `)}
            </div>
          </section>
          <section>
            <h3>Ваши аукционы</h3>
            <ul style="font-size:0.95em;">
              ${this.userAuctions.map(a => html`<li>Работа #${a.tokenId} — ставка: ${a.highestBid} ICP, статус: ${a.isActive ? html`<span style="color:#00ff41">активен</span>` : html`<span style="color:#ff0041">завершён</span>`}</li>`)}
            </ul>
          </section>
          <section>
            <h3>Ваши инвайты</h3>
            <ul class="invite-list">
              ${this.invites.map(i => html`<li>${i.code} — ${i.usedBy ? html`<span style="color:#ff0041">использован</span>` : html`<span style="color:#00ff41">активен</span>`}</li>`)}
            </ul>
          </section>
        </main>
      `;
    }
    else if (this.showAdminPanel && this.isAdmin) {
      // --- АДМИН-ПАНЕЛЬ ---
      const allWorks = [...this.works, ...this.worksBlob];
      const uniqueAuthors = Array.from(new Set(allWorks.map(w => w.owner)));
      const uniqueStatuses = ['pending', 'approved', 'rejected'];
      // Фильтрация
      let filteredWorks = allWorks.filter(w => {
        const matchesText = this.adminSearchText === '' || (w.description && w.description.toLowerCase().includes(this.adminSearchText.toLowerCase()));
        const matchesAuthor = this.adminFilterAuthor === '' || w.owner === this.adminFilterAuthor;
        const matchesStatus = this.adminFilterStatus === '' || (w.status && w.status[Object.keys(w.status)[0]] === this.adminFilterStatus);
        return matchesText && matchesAuthor && matchesStatus;
      });
      body = html`
        <main>
          <h2>🛡️ Админ-панель</h2>
          <button @click=${() => { this.showAdminPanel = false; this.#render(); }}>← В галерею</button>
          <div style="margin:1em 0;">Principal: <b>${this.principal}</b></div>
          <section>
            <h3>Работы на модерации</h3>
            <div style="display:flex;flex-wrap:wrap;gap:1em;margin-bottom:1em;align-items:center;">
              <input type="text" placeholder="Поиск по описанию..." .value=${this.adminSearchText} @input=${e => { this.adminSearchText = e.target.value; this.#render(); }} style="flex:1;min-width:120px;" />
              <select @change=${e => { this.adminFilterAuthor = e.target.value; this.#render(); }}>
                <option value="">Все авторы</option>
                ${uniqueAuthors.map(a => html`<option value="${a}" ?selected=${this.adminFilterAuthor===a}>${a}</option>`)}
              </select>
              <select @change=${e => { this.adminFilterStatus = e.target.value; this.#render(); }}>
                <option value="">Все статусы</option>
                ${uniqueStatuses.map(s => html`<option value="${s}" ?selected=${this.adminFilterStatus===s}>${s}</option>`)}
              </select>
            </div>
            <div class="matrix-gallery">
              ${filteredWorks.length === 0 ? html`<div>Нет работ</div>` :
                filteredWorks.map(w => html`
                  <div class="matrix-card">
                    ${w.fileUrl ? html`<img src="${w.fileUrl}" alt="work" />` :
                      w.contentType && w.contentType.startsWith('image') ? html`<img src="data:${w.contentType};base64,${btoa(String.fromCharCode(...w.file))}" alt="work" />` :
                      html`<a href="data:${w.contentType};base64,${btoa(String.fromCharCode(...w.file))}" download="work_${w.tokenId}">Скачать файл</a>`}
                    <div><b>${w.description}</b></div>
                    <div style="font-size:0.9em;opacity:0.7;">Автор: ${w.owner}</div>
                    <div style="font-size:0.9em;opacity:0.7;">Создано: ${new Date(Number(w.createdAt/1_000_000)).toLocaleString()}</div>
                    <div style="font-size:0.9em;opacity:0.7;">Статус: <b>${w.status ? Object.keys(w.status)[0] : 'unknown'}</b></div>
                    <div style="margin-top:0.7em;display:flex;gap:0.5em;">
                      <button style="background:#00ff41;color:#111;" ?disabled=${this.adminActionLoading[w.tokenId]} @click=${() => this.#approveWork(w.tokenId)}>Одобрить</button>
                      <button style="background:#ffea00;color:#111;" ?disabled=${this.adminActionLoading[w.tokenId]} @click=${() => this.#rejectWork(w.tokenId)}>Отклонить</button>
                      <button style="background:#ff0041;color:#fff;" ?disabled=${this.adminActionLoading[w.tokenId]} @click=${() => this.#confirmRemoveWork(w.tokenId)}>Удалить</button>
                    </div>
                  </div>
                `)}
            </div>
          </section>
        </main>
      `;
    }
    else {
      // Собираем уникальных авторов для фильтра
      const allWorks = [...this.works, ...this.worksBlob];
      const uniqueAuthors = Array.from(new Set(allWorks.map(w => w.owner)));
      // Фильтрация работ: только approved!
      let filteredWorks = allWorks.filter(w => {
        const isApproved = w.status && w.status.approved !== undefined;
        const matchesText = this.searchText === '' || (w.description && w.description.toLowerCase().includes(this.searchText.toLowerCase()));
        const matchesAuthor = this.filterAuthor === '' || w.owner === this.filterAuthor;
        const auction = this.auctionStatus[w.tokenId];
        const matchesAuction = this.filterAuction === '' || (this.filterAuction === 'active' && auction && auction.isActive) || (this.filterAuction === 'finished' && auction && !auction.isActive) || (this.filterAuction === 'no' && (!auction));
        return isApproved && matchesText && matchesAuthor && matchesAuction;
      });
      body = html`
        <main>
          <h2>🌱 SUNRICE COMMUNITY</h2>
          <button @click=${() => { this.showProfile = true; this.#loadProfile(); }}>Профиль</button>
          ${this.isAdmin ? html`<button @click=${() => { this.showAdminPanel = true; this.#render(); }} style="margin-left:1em;">Админ-панель</button>` : ''}
          <button @click=${this.#connectPlug} style="margin-left:1em;${this.plugConnected?'background:#00ff41;color:#111;':''}">
            ${this.plugConnected ? 'Plug подключён' : 'Подключить Plug Wallet'}
          </button>
          ${this.plugConnected && this.plugPrincipal ? html`<div style="font-size:0.95em;opacity:0.7;">Plug Principal: ${this.plugPrincipal}</div>` : ''}
          <section>
            <h3>Галерея работ</h3>
            <div style="display:flex;flex-wrap:wrap;gap:1em;margin-bottom:1em;align-items:center;">
              <input type="text" placeholder="Поиск по описанию..." .value=${this.searchText} @input=${e => { this.searchText = e.target.value; this.#render(); }} style="flex:1;min-width:120px;" />
              <select @change=${e => { this.filterAuthor = e.target.value; this.#render(); }}>
                <option value="">Все авторы</option>
                ${uniqueAuthors.map(a => html`<option value="${a}" ?selected=${this.filterAuthor===a}>${a}</option>`)}
              </select>
              <select @change=${e => { this.filterAuction = e.target.value; this.#render(); }}>
                <option value="">Все статусы</option>
                <option value="active" ?selected=${this.filterAuction==='active'}>Аукцион активен</option>
                <option value="finished" ?selected=${this.filterAuction==='finished'}>Аукцион завершён</option>
                <option value="no" ?selected=${this.filterAuction==='no'}>Без аукциона</option>
              </select>
            </div>
            ${this.loadingWorks ? html`<p>Загрузка...</p>` : html`
              <div class="matrix-gallery">
                ${filteredWorks.map(w => html`
                  <div class="matrix-card">
                    ${w.fileUrl ? html`<img src="${w.fileUrl}" alt="work" />` :
                      w.contentType && w.contentType.startsWith('image') ? html`<img src="data:${w.contentType};base64,${btoa(String.fromCharCode(...w.file))}" alt="work" />` :
                      html`<a href="data:${w.contentType};base64,${btoa(String.fromCharCode(...w.file))}" download="work_${w.tokenId}">Скачать файл</a>`}
                    <div><b>${w.description}</b></div>
                    <div style="font-size:0.9em;opacity:0.7;">Автор: ${w.owner}</div>
                    <div style="font-size:0.9em;opacity:0.7;">Создано: ${new Date(Number(w.createdAt/1_000_000)).toLocaleString()}</div>
                    ${this.auctionStatus[w.tokenId] && this.auctionStatus[w.tokenId].isActive ? html`
                      <div style="margin-top:0.5em;">
                        <b>Аукцион</b><br/>
                        Ставка: ${this.auctionStatus[w.tokenId].highestBid} ICP<br/>
                        До: ${new Date(Number(this.auctionStatus[w.tokenId].endTime/1_000_000)).toLocaleString()}<br/>
                        <input type="number" min="1" placeholder="Ваша ставка" .value=${this.bidInput[w.tokenId]||''} @input=${e => { this.bidInput[w.tokenId]=e.target.value; }} />
                        <button @click=${() => this.#placeBid(w.tokenId)}>Сделать ставку</button>
                        <button @click=${() => this.#finishAuction(w.tokenId)}>Завершить аукцион</button>
                        <div style="margin-top:0.5em;">
                          <b>История ставок:</b>
                          <ul style="font-size:0.95em; margin:0; padding:0; list-style:none;">
                            ${(this.auctionBids[w.tokenId]||[]).length === 0 ? html`<li>Нет ставок</li>` :
                              this.auctionBids[w.tokenId].slice().reverse().map(bid => html`<li>${bid.amount} ICP — ${bid.bidder} <span style="opacity:0.7;">(${new Date(Number(bid.time/1_000_000)).toLocaleString()})</span></li>`)}
                          </ul>
                        </div>
                      </div>
                    ` : html`
                      <button @click=${() => this.#startAuction(w.tokenId)}>Запустить аукцион (24ч)</button>
                    `}
                  </div>
                `)}
              </div>
            `}
          </section>
          <section>
            <h3>Инвайты</h3>
            <button @click=${this.#generateInvite}>Сгенерировать инвайт</button>
            ${this.inviteCode ? html`<div>Ваш инвайт-код: <b>${this.inviteCode}</b></div>` : ''}
            <ul class="invite-list">
              ${this.invites.map(i => html`<li>${i.code} — ${i.usedBy ? html`<span style="color:#ff0041">использован</span>` : html`<span style="color:#00ff41">активен</span>`}</li>`)}
            </ul>
          </section>
      </main>
    `;
    }
    render(body, document.getElementById('root'));
    if (!this.identity) {
      document.getElementById('login-btn').onclick = this.#login;
    } else if (!this.hasAccess) {
      document.getElementById('mint-btn').onclick = this.#mintPostulate;
      document.getElementById('invite-form').onsubmit = this.#useInvite;
    } else {
      document.getElementById('upload-form').onsubmit = this.#uploadWork;
    }
    // Toast
    if (this.toast) {
      let toastDiv = document.getElementById('matrix-toast');
      if (!toastDiv) {
        toastDiv = document.createElement('div');
        toastDiv.id = 'matrix-toast';
        document.body.appendChild(toastDiv);
      }
      toastDiv.innerHTML = `<div style="position:fixed;bottom:30px;left:50%;transform:translateX(-50%);background:${this.toast.type==='error'?'#ff0041':'#00ff41'};color:#111;padding:1em 2em;border-radius:8px;box-shadow:0 0 16px #00ff41aa;font-family:inherit;font-size:1.1em;z-index:9999;">${this.toast.msg}</div>`;
    } else {
      const toastDiv = document.getElementById('matrix-toast');
      if (toastDiv) toastDiv.remove();
    }
  }

  // --- Методы для админ-панели ---
  #approveWork = async (tokenId) => {
    this.adminActionLoading[tokenId] = true;
    this.#render();
    try {
      await nft_mint.approveWork(tokenId);
      this.#showToast('Работа одобрена!');
      await this.#loadWorks();
    } catch (e) {
      this.#showToast('Ошибка одобрения', 'error');
    }
    this.adminActionLoading[tokenId] = false;
    this.#render();
  };
  #rejectWork = async (tokenId) => {
    this.adminActionLoading[tokenId] = true;
    this.#render();
    try {
      await nft_mint.rejectWork(tokenId);
      this.#showToast('Работа отклонена!');
      await this.#loadWorks();
    } catch (e) {
      this.#showToast('Ошибка отклонения', 'error');
    }
    this.adminActionLoading[tokenId] = false;
    this.#render();
  };
  #confirmRemoveWork = (tokenId) => {
    if (confirm('Удалить работу безвозвратно?')) {
      this.#removeWork(tokenId);
    }
  };
  #removeWork = async (tokenId) => {
    this.adminActionLoading[tokenId] = true;
    this.#render();
    try {
      await nft_mint.removeWork(tokenId);
      this.#showToast('Работа удалена!');
      await this.#loadWorks();
    } catch (e) {
      this.#showToast('Ошибка удаления', 'error');
    }
    this.adminActionLoading[tokenId] = false;
    this.#render();
  };
}

export default App;
