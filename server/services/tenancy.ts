import { storage } from "../storage";
import type { Organization, OrganizationMembership, OrgWallet, User } from "@shared/schema";

export interface OrgWithWallet {
  org: Organization;
  wallet: OrgWallet;
  membership?: OrganizationMembership;
}

export interface UserOrg {
  orgId: string;
  name: string;
  slug: string;
  role: "OWNER" | "ADMIN" | "MEMBER";
  status: "ACTIVE" | "INVITED" | "SUSPENDED";
  walletId: string;
  balanceCents: number;
  isPersonal: boolean;
}

export class TenancyService {
  private generateSlug(name: string): string {
    const randomSuffix = Math.random().toString(36).substring(2, 8);
    return name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .substring(0, 40) + "-" + Date.now().toString(36) + randomSuffix;
  }

  private async generateUniqueSlug(baseName: string): Promise<string> {
    let slug = this.generateSlug(baseName);
    let attempts = 0;
    while (attempts < 5) {
      const existing = await storage.getOrganizationBySlug(slug);
      if (!existing) return slug;
      slug = this.generateSlug(baseName);
      attempts++;
    }
    throw new TenancyError("SLUG_COLLISION", "Failed to generate unique organization slug");
  }

  async getOrCreatePersonalOrg(userId: string): Promise<OrgWithWallet> {
    let org = await storage.getPersonalOrganization(userId);
    
    if (!org) {
      const user = await storage.getUser(userId);
      if (!user) {
        throw new TenancyError("USER_NOT_FOUND", "User not found");
      }

      const orgName = `${user.email.split("@")[0]} Personal`;
      const slug = await this.generateUniqueSlug(`personal-${userId.substring(0, 8)}`);

      org = await storage.createOrganization({
        name: orgName,
        slug,
        isPersonal: true,
        createdByUserId: userId,
      });

      await storage.createMembership({
        organizationId: org.id,
        userId,
        role: "OWNER",
        status: "ACTIVE",
      });

      const existingWallet = await storage.getWalletByUserId(userId);
      const initialBalance = existingWallet?.balanceCents || 0;

      await storage.createOrgWallet({
        organizationId: org.id,
        type: "CREDITS",
        balanceCents: initialBalance,
        status: "ACTIVE",
      });
    }

    const wallet = await storage.getOrgWalletByOrgId(org.id);
    if (!wallet) {
      const createdWallet = await storage.createOrgWallet({
        organizationId: org.id,
        type: "CREDITS",
        balanceCents: 0,
        status: "ACTIVE",
      });
      return { org, wallet: createdWallet };
    }

    return { org, wallet };
  }

  async listUserOrgs(userId: string): Promise<UserOrg[]> {
    const memberships = await storage.getMembershipsByUserId(userId);
    const orgs: UserOrg[] = [];

    for (const membership of memberships) {
      if (membership.status !== "ACTIVE") continue;
      
      const wallet = await storage.getOrgWalletByOrgId(membership.organizationId);
      
      orgs.push({
        orgId: membership.organization.id,
        name: membership.organization.name,
        slug: membership.organization.slug,
        role: membership.role,
        status: membership.status,
        walletId: wallet?.id || "",
        balanceCents: wallet?.balanceCents || 0,
        isPersonal: membership.organization.isPersonal,
      });
    }

    return orgs;
  }

  async assertUserInOrg(userId: string, orgId: string): Promise<OrganizationMembership> {
    const membership = await storage.getMembership(orgId, userId);
    
    if (!membership) {
      throw new TenancyError("NOT_A_MEMBER", "User is not a member of this organization");
    }
    
    if (membership.status !== "ACTIVE") {
      throw new TenancyError("MEMBERSHIP_NOT_ACTIVE", `Membership status is ${membership.status}`);
    }

    return membership;
  }

  async assertUserCanManageOrg(userId: string, orgId: string): Promise<OrganizationMembership> {
    const membership = await this.assertUserInOrg(userId, orgId);
    
    if (membership.role !== "OWNER" && membership.role !== "ADMIN") {
      throw new TenancyError("INSUFFICIENT_PERMISSIONS", "Only OWNER or ADMIN can manage organization");
    }

    return membership;
  }

  async createOrg(userId: string, name: string): Promise<OrgWithWallet> {
    const slug = await this.generateUniqueSlug(name);

    const org = await storage.createOrganization({
      name,
      slug,
      isPersonal: false,
      createdByUserId: userId,
    });

    await storage.createMembership({
      organizationId: org.id,
      userId,
      role: "OWNER",
      status: "ACTIVE",
    });

    const wallet = await storage.createOrgWallet({
      organizationId: org.id,
      type: "CREDITS",
      balanceCents: 0,
      status: "ACTIVE",
    });

    return { org, wallet };
  }

  async addUserToOrg(
    adminUserId: string,
    orgId: string,
    targetUserId: string,
    role: "ADMIN" | "MEMBER"
  ): Promise<OrganizationMembership> {
    await this.assertUserCanManageOrg(adminUserId, orgId);

    const existingMembership = await storage.getMembership(orgId, targetUserId);
    if (existingMembership) {
      if (existingMembership.status === "ACTIVE") {
        throw new TenancyError("ALREADY_MEMBER", "User is already an active member");
      }
      const updated = await storage.updateMembership(existingMembership.id, {
        role,
        status: "ACTIVE",
      });
      return updated!;
    }

    const targetUser = await storage.getUser(targetUserId);
    if (!targetUser) {
      throw new TenancyError("USER_NOT_FOUND", "Target user does not exist");
    }

    return storage.createMembership({
      organizationId: orgId,
      userId: targetUserId,
      role,
      status: "ACTIVE",
    });
  }

  async addUserToOrgByEmail(
    adminUserId: string,
    orgId: string,
    email: string,
    role: "ADMIN" | "MEMBER"
  ): Promise<OrganizationMembership> {
    const targetUser = await storage.getUserByEmail(email);
    if (!targetUser) {
      throw new TenancyError("USER_NOT_FOUND", `No user found with email: ${email}`);
    }

    return this.addUserToOrg(adminUserId, orgId, targetUser.id, role);
  }

  async removeUserFromOrg(
    adminUserId: string,
    orgId: string,
    targetUserId: string
  ): Promise<boolean> {
    const adminMembership = await this.assertUserCanManageOrg(adminUserId, orgId);
    
    if (targetUserId === adminUserId) {
      throw new TenancyError("CANNOT_REMOVE_SELF", "Cannot remove yourself from organization");
    }

    const targetMembership = await storage.getMembership(orgId, targetUserId);
    if (!targetMembership) {
      throw new TenancyError("NOT_A_MEMBER", "Target user is not a member");
    }

    if (targetMembership.role === "OWNER" && adminMembership.role !== "OWNER") {
      throw new TenancyError("CANNOT_REMOVE_OWNER", "Only owners can remove other owners");
    }

    return storage.deleteMembership(targetMembership.id);
  }

  async updateMemberRole(
    adminUserId: string,
    orgId: string,
    targetUserId: string,
    newRole: "ADMIN" | "MEMBER"
  ): Promise<OrganizationMembership> {
    await this.assertUserCanManageOrg(adminUserId, orgId);

    const targetMembership = await storage.getMembership(orgId, targetUserId);
    if (!targetMembership) {
      throw new TenancyError("NOT_A_MEMBER", "Target user is not a member");
    }

    if (targetMembership.role === "OWNER") {
      throw new TenancyError("CANNOT_CHANGE_OWNER_ROLE", "Cannot change the role of an owner");
    }

    const updated = await storage.updateMembership(targetMembership.id, { role: newRole });
    return updated!;
  }

  async getOrgDetails(
    userId: string,
    orgId: string
  ): Promise<{
    org: Organization;
    wallet: OrgWallet;
    members: Array<{
      userId: string;
      email: string;
      fullName: string | null;
      role: string;
      status: string;
    }>;
  }> {
    await this.assertUserInOrg(userId, orgId);

    const org = await storage.getOrganization(orgId);
    if (!org) {
      throw new TenancyError("ORG_NOT_FOUND", "Organization not found");
    }

    const wallet = await storage.getOrgWalletByOrgId(orgId);
    if (!wallet) {
      throw new TenancyError("WALLET_NOT_FOUND", "Organization wallet not found");
    }

    const memberships = await storage.getMembershipsByOrgId(orgId);
    const members = memberships.map(m => ({
      userId: m.userId,
      email: m.user.email,
      fullName: m.user.fullName,
      role: m.role,
      status: m.status,
    }));

    return { org, wallet, members };
  }

  async burnCredits(
    userId: string,
    orgId: string | null,
    amount: number,
    product: string,
    externalRef: string,
    feature?: string,
    metadata?: Record<string, unknown>
  ): Promise<{
    approved: boolean;
    balance: number;
    ledgerId?: string;
    error?: string;
  }> {
    let targetOrgId = orgId;
    
    if (!targetOrgId) {
      const personalOrg = await this.getOrCreatePersonalOrg(userId);
      targetOrgId = personalOrg.org.id;
    }

    await this.assertUserInOrg(userId, targetOrgId);

    const wallet = await storage.getOrgWalletByOrgId(targetOrgId);
    if (!wallet) {
      return { approved: false, balance: 0, error: "Wallet not found" };
    }

    if (wallet.status !== "ACTIVE") {
      return { approved: false, balance: wallet.balanceCents, error: "Wallet is suspended" };
    }

    const existingEntry = await storage.getOrgCreditLedgerByExternalRef(wallet.id, externalRef);
    if (existingEntry) {
      return {
        approved: true,
        balance: wallet.balanceCents,
        ledgerId: existingEntry.id,
      };
    }

    if (wallet.balanceCents < amount) {
      return {
        approved: false,
        balance: wallet.balanceCents,
        error: "Insufficient balance",
      };
    }

    const ledgerEntry = await storage.createOrgCreditLedgerEntry({
      walletId: wallet.id,
      direction: "DEBIT",
      amount,
      product,
      feature: feature || null,
      externalRef,
      performedByUserId: userId,
      metadataJson: metadata || null,
    });

    const updatedWallet = await storage.updateOrgWalletBalance(wallet.id, -amount);

    return {
      approved: true,
      balance: updatedWallet?.balanceCents || wallet.balanceCents - amount,
      ledgerId: ledgerEntry.id,
    };
  }

  async addCredits(
    userId: string,
    orgId: string | null,
    amount: number,
    product: string,
    externalRef: string,
    feature?: string,
    metadata?: Record<string, unknown>
  ): Promise<{
    success: boolean;
    balance: number;
    ledgerId?: string;
    error?: string;
  }> {
    let targetOrgId = orgId;
    
    if (!targetOrgId) {
      const personalOrg = await this.getOrCreatePersonalOrg(userId);
      targetOrgId = personalOrg.org.id;
    }

    const wallet = await storage.getOrgWalletByOrgId(targetOrgId);
    if (!wallet) {
      return { success: false, balance: 0, error: "Wallet not found" };
    }

    const existingEntry = await storage.getOrgCreditLedgerByExternalRef(wallet.id, externalRef);
    if (existingEntry) {
      return {
        success: true,
        balance: wallet.balanceCents,
        ledgerId: existingEntry.id,
      };
    }

    const ledgerEntry = await storage.createOrgCreditLedgerEntry({
      walletId: wallet.id,
      direction: "CREDIT",
      amount,
      product,
      feature: feature || null,
      externalRef,
      performedByUserId: userId,
      metadataJson: metadata || null,
    });

    const updatedWallet = await storage.updateOrgWalletBalance(wallet.id, amount);

    return {
      success: true,
      balance: updatedWallet?.balanceCents || wallet.balanceCents + amount,
      ledgerId: ledgerEntry.id,
    };
  }
}

export class TenancyError extends Error {
  constructor(
    public code: string,
    message: string
  ) {
    super(message);
    this.name = "TenancyError";
  }
}

export const tenancyService = new TenancyService();
