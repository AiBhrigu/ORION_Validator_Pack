import List "mo:base/List";

actor {
  type Proposal = {
    id : Nat;
    description : Text;
    votesYes : Nat;
    votesNo : Nat;
  };

  stable var proposals : List.List<Proposal> = List.nil();

  public shared func createProposal(desc : Text) : async Nat {
    let id = List.size(proposals) + 1;
    proposals := List.push({
      id = id;
      description = desc;
      votesYes = 0;
      votesNo = 0;
    }, proposals);
    id
  };

  public shared func vote(id : Nat, yes : Bool) : async Bool {
    proposals := List.map<Proposal, Proposal>(proposals, func(p) {
      if (p.id == id) {
        if (yes) { p.votesYes += 1 } else { p.votesNo += 1 };
        p
      } else p
    });
    true
  };

  public query func getProposals() : async [Proposal] {
    List.toArray(proposals)
  };
};
