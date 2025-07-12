import Nat "mo:base/Nat";

actor {
  stable var totalSupply : Nat = 0;
  stable var balances : Trie.Trie<Principal, Nat> = Trie.empty();

  public shared(msg) func mint(to : Principal, amount : Nat) : async () {
    let bal = Trie.get(balances, to) ? 0;
    balances := Trie.put(balances, to, bal + amount);
    totalSupply += amount;
  };

  public query func balanceOf(who : Principal) : async Nat {
    Trie.get(balances, who) ? 0;
  };

  public shared(msg) func transfer(to : Principal, amount : Nat) : async Bool {
    let from = msg.caller;
    let bal = Trie.get(balances, from) ? 0;
    if (bal < amount) return false;
    balances := Trie.put(balances, from, bal - amount);
    let toBal = Trie.get(balances, to) ? 0;
    balances := Trie.put(balances, to, toBal + amount);
    return true;
  };
};
