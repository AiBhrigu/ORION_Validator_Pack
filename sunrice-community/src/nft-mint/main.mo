import Nat "mo:base/Nat";
import Principal "mo:base/Principal";
import HashMap "mo:base/HashMap";
import Time "mo:base/Time";
import Blob "mo:base/Blob";
import Nat32 "mo:base/Nat32";
import Buffer "mo:base/Buffer";
import Text "mo:base/Text";
import Array "mo:base/Array";

actor {
  type TokenId = Nat;
  type Metadata = {
    description: Text;
    issuedAt: Int;
  };
  type WorkStatus = {
    #pending;
    #approved;
    #rejected;
  };
  type Work = {
    tokenId: TokenId;
    owner: Principal;
    fileUrl: Text;
    description: Text;
    createdAt: Int;
    status: WorkStatus;
  };
  type WorkWithBlob = {
    tokenId: TokenId;
    owner: Principal;
    file: Blob;
    description: Text;
    createdAt: Int;
    contentType: Text;
    status: WorkStatus;
  };
  type Auction = {
    tokenId: TokenId;
    endTime: Int;
    highestBid: Nat;
    highestBidder: ?Principal;
    isActive: Bool;
    bids: [Bid];
  };
  type Invite = {
    code: Text;
    issuedTo: Principal;
    usedBy: ?Principal;
    issuedAt: Int;
    usedAt: ?Int;
  };
  type Bid = {
    bidder: Principal;
    amount: Nat;
    time: Int;
  };

  var nextTokenId : TokenId = 1;
  var owners = HashMap.HashMap<TokenId, Principal>(0, Nat.equal, func (n) = Nat32.fromNat(n));
  var postulateByOwner = HashMap.HashMap<Principal, TokenId>(0, Principal.equal, func (p) = Blob.hash(Principal.toBlob(p)));
  var metadata = HashMap.HashMap<TokenId, Metadata>(0, Nat.equal, func (n) = Nat32.fromNat(n));
  var works = HashMap.HashMap<TokenId, Work>(0, Nat.equal, func (n) = Nat32.fromNat(n));
  var worksWithBlob = HashMap.HashMap<TokenId, WorkWithBlob>(0, Nat.equal, func (n) = Nat32.fromNat(n));
  var auctions = HashMap.HashMap<TokenId, Auction>(0, Nat.equal, func (n) = Nat32.fromNat(n));
  var invitesByCode = HashMap.HashMap<Text, Invite>(0, Text.equal, Text.hash);
  var invitesByOwner = HashMap.HashMap<Principal, Buffer.Buffer<Invite>>(0, Principal.equal, func (p) = Blob.hash(Principal.toBlob(p)));

  let ADMIN_PRINCIPAL = Principal.fromText("aaaaa-aa"); // TODO: заменить на реальный principal админа

  func isAdmin(p: Principal) : Bool {
    p == ADMIN_PRINCIPAL
  };

  // --- ИНВАЙТЫ ---
  public shared(msg) func generateInvite() : async Text {
    let code = Text.concat("INV-", Nat.toText(Time.now() + Nat32.toNat(Blob.hash(Principal.toBlob(msg.caller)))));
    let invite : Invite = {
      code = code;
      issuedTo = msg.caller;
      usedBy = null;
      issuedAt = Time.now();
      usedAt = null;
    };
    invitesByCode.put(code, invite);
    let buf = invitesByOwner.get(msg.caller);
    if (buf == null) {
      let newBuf = Buffer.Buffer<Invite>(1);
      newBuf.add(invite);
      invitesByOwner.put(msg.caller, newBuf);
    } else {
      buf!.add(invite);
    };
    return code;
  };

  public shared(msg) func giveInvites(to: Principal, count: Nat) : async () {
    var i = 0;
    while (i < count) {
      let code = Text.concat("INV-", Nat.toText(Time.now() + i + Nat32.toNat(Blob.hash(Principal.toBlob(to)))));
      let invite : Invite = {
        code = code;
        issuedTo = to;
        usedBy = null;
        issuedAt = Time.now();
        usedAt = null;
      };
      invitesByCode.put(code, invite);
      let buf = invitesByOwner.get(to);
      if (buf == null) {
        let newBuf = Buffer.Buffer<Invite>(1);
        newBuf.add(invite);
        invitesByOwner.put(to, newBuf);
      } else {
        buf!.add(invite);
      };
      i += 1;
    }
  };

  public shared(msg) func useInvite(code: Text) : async Bool {
    let inviteOpt = invitesByCode.get(code);
    if (inviteOpt == null) return false;
    let invite = inviteOpt!;
    if (invite.usedBy != null) return false; // Уже использован
    let updated : Invite = {
      code = invite.code;
      issuedTo = invite.issuedTo;
      usedBy = ?msg.caller;
      issuedAt = invite.issuedAt;
      usedAt = ?Time.now();
    };
    invitesByCode.put(code, updated);
    // Инвайт считается сгоревшим — повторное использование невозможно
    return true;
  };

  public query func getInvite(code: Text) : async ?Invite {
    invitesByCode.get(code)
  };

  public query func getInvites(owner: Principal) : async [Invite] {
    let buf = invitesByOwner.get(owner);
    if (buf == null) return [];
    Array.tabulate<Invite>(buf!.size(), func i = buf!.get(i));
  };

  // --- АУКЦИОН, NFT и работы ---
  public shared(msg) func mintPostulateNFT(to: Principal, desc: Text) : async ?TokenId {
    if (postulateByOwner.get(to) != null) {
      return null;
    };
    let tokenId = nextTokenId;
    nextTokenId += 1;
    owners.put(tokenId, to);
    postulateByOwner.put(to, tokenId);
    metadata.put(tokenId, {
      description = desc;
      issuedAt = Time.now();
    });
    return ?tokenId;
  };

  public shared(msg) func uploadWork(fileUrl: Text, description: Text) : async TokenId {
    let tokenId = nextTokenId;
    nextTokenId += 1;
    let owner = msg.caller;
    owners.put(tokenId, owner);
    let createdAt = Time.now();
    metadata.put(tokenId, {
      description = description;
      issuedAt = createdAt;
    });
    let work : Work = {
      tokenId = tokenId;
      owner = owner;
      fileUrl = fileUrl;
      description = description;
      createdAt = createdAt;
      status = #pending;
    };
    works.put(tokenId, work);
    // Автоматически выдаём 3 инвайта автору
    ignore giveInvites(owner, 3);
    return tokenId;
  };

  public shared(msg) func uploadWorkWithBlob(file: Blob, description: Text, contentType: Text) : async TokenId {
    let tokenId = nextTokenId;
    nextTokenId += 1;
    let owner = msg.caller;
    owners.put(tokenId, owner);
    let createdAt = Time.now();
    let work : WorkWithBlob = {
      tokenId = tokenId;
      owner = owner;
      file = file;
      description = description;
      createdAt = createdAt;
      contentType = contentType;
      status = #pending;
    };
    worksWithBlob.put(tokenId, work);
    // Автоматически выдаём 3 инвайта автору
    ignore giveInvites(owner, 3);
    return tokenId;
  };

  // --- АУКЦИОН ---
  public shared(msg) func startAuction(tokenId: TokenId, durationSeconds: Nat) : async Bool {
    if (auctions.get(tokenId) != null) return false; // Уже есть аукцион
    let now = Time.now();
    let auction : Auction = {
      tokenId = tokenId;
      endTime = now + (durationSeconds * 1_000_000_000); // ns
      highestBid = 0;
      highestBidder = null;
      isActive = true;
      bids = [];
    };
    auctions.put(tokenId, auction);
    return true;
  };

  public shared(msg) func placeBid(tokenId: TokenId, bid: Nat) : async Bool {
    let auctionOpt = auctions.get(tokenId);
    if (auctionOpt == null) return false;
    let auction = auctionOpt!;
    if (!auction.isActive || Time.now() > auction.endTime) return false;
    if (bid <= auction.highestBid) return false;
    let newBid : Bid = {
      bidder = msg.caller;
      amount = bid;
      time = Time.now();
    };
    let newAuction = {
      tokenId = auction.tokenId;
      endTime = auction.endTime;
      highestBid = bid;
      highestBidder = ?msg.caller;
      isActive = true;
      bids = Array.append(auction.bids, [newBid]);
    };
    auctions.put(tokenId, newAuction);
    return true;
  };

  public shared(msg) func finishAuction(tokenId: TokenId) : async ?Principal {
    let auctionOpt = auctions.get(tokenId);
    if (auctionOpt == null) return null;
    let auction = auctionOpt!;
    if (!auction.isActive) return auction.highestBidder;
    if (Time.now() < auction.endTime) return null; // Ещё не закончен
    let newAuction = {
      tokenId = auction.tokenId;
      endTime = auction.endTime;
      highestBid = auction.highestBid;
      highestBidder = auction.highestBidder;
      isActive = false;
    };
    auctions.put(tokenId, newAuction);
    // (опционально) передать NFT победителю
    if (auction.highestBidder != null) {
      owners.put(tokenId, auction.highestBidder!);
    };
    return auction.highestBidder;
  };

  public query func getAuction(tokenId: TokenId) : async ?Auction {
    auctions.get(tokenId)
  };

  public query func getAuctionBids(tokenId: TokenId) : async [Bid] {
    let auctionOpt = auctions.get(tokenId);
    if (auctionOpt == null) return [];
    auctionOpt!.bids
  };

  public shared(msg) func approveWork(tokenId: TokenId) : async Bool {
    if (!isAdmin(msg.caller)) return false;
    let wOpt = works.get(tokenId);
    if (wOpt != null) {
      let w = wOpt!;
      works.put(tokenId, {
        tokenId = w.tokenId;
        owner = w.owner;
        fileUrl = w.fileUrl;
        description = w.description;
        createdAt = w.createdAt;
        status = #approved;
      });
      return true;
    };
    let wbOpt = worksWithBlob.get(tokenId);
    if (wbOpt != null) {
      let wb = wbOpt!;
      worksWithBlob.put(tokenId, {
        tokenId = wb.tokenId;
        owner = wb.owner;
        file = wb.file;
        description = wb.description;
        createdAt = wb.createdAt;
        contentType = wb.contentType;
        status = #approved;
      });
      return true;
    };
    return false;
  };

  public shared(msg) func rejectWork(tokenId: TokenId) : async Bool {
    if (!isAdmin(msg.caller)) return false;
    let wOpt = works.get(tokenId);
    if (wOpt != null) {
      let w = wOpt!;
      works.put(tokenId, {
        tokenId = w.tokenId;
        owner = w.owner;
        fileUrl = w.fileUrl;
        description = w.description;
        createdAt = w.createdAt;
        status = #rejected;
      });
      return true;
    };
    let wbOpt = worksWithBlob.get(tokenId);
    if (wbOpt != null) {
      let wb = wbOpt!;
      worksWithBlob.put(tokenId, {
        tokenId = wb.tokenId;
        owner = wb.owner;
        file = wb.file;
        description = wb.description;
        createdAt = wb.createdAt;
        contentType = wb.contentType;
        status = #rejected;
      });
      return true;
    };
    return false;
  };

  public shared(msg) func removeWork(tokenId: TokenId) : async Bool {
    if (!isAdmin(msg.caller)) return false;
    ignore works.remove(tokenId);
    ignore worksWithBlob.remove(tokenId);
    ignore auctions.remove(tokenId);
    return true;
  };

  // --- СТАРЫЕ МЕТОДЫ ---
  public query func ownerOf(tokenId: TokenId) : async ?Principal {
    owners.get(tokenId)
  };

  public query func getPostulateByOwner(owner: Principal) : async ?TokenId {
    postulateByOwner.get(owner)
  };

  public query func hasPostulate(owner: Principal) : async Bool {
    postulateByOwner.get(owner) != null
  };

  public query func getMetadata(tokenId: TokenId) : async ?Metadata {
    metadata.get(tokenId)
  };

  public query func getWork(tokenId: TokenId) : async ?Work {
    works.get(tokenId)
  };

  public query func getAllWorks() : async [Work] {
    let arr = Buffer.Buffer<Work>(works.size());
    for ((_, w) in works.entries()) {
      arr.add(w);
    };
    Buffer.toArray(arr)
  };

  public query func getWorkBlob(tokenId: TokenId) : async ?WorkWithBlob {
    worksWithBlob.get(tokenId)
  };

  public query func getAllWorksWithBlob() : async [WorkWithBlob] {
    let arr = Buffer.Buffer<WorkWithBlob>(worksWithBlob.size());
    for ((_, w) in worksWithBlob.entries()) {
      arr.add(w);
    };
    Buffer.toArray(arr)
  };

  public query func getUserWorks(owner: Principal) : async [Work] {
    let arr = Buffer.Buffer<Work>(works.size());
    for ((_, w) in works.entries()) {
      if (w.owner == owner) arr.add(w);
    };
    Buffer.toArray(arr)
  };

  public query func getUserWorksWithBlob(owner: Principal) : async [WorkWithBlob] {
    let arr = Buffer.Buffer<WorkWithBlob>(worksWithBlob.size());
    for ((_, w) in worksWithBlob.entries()) {
      if (w.owner == owner) arr.add(w);
    };
    Buffer.toArray(arr)
  };

  public query func getUserAuctions(owner: Principal) : async [Auction] {
    let arr = Buffer.Buffer<Auction>(auctions.size());
    for ((_, a) in auctions.entries()) {
      let w = works.get(a.tokenId);
      let wb = worksWithBlob.get(a.tokenId);
      if ((w != null && w.owner == owner) || (wb != null && wb.owner == owner)) {
        arr.add(a);
      }
    };
    Buffer.toArray(arr)
  };
}