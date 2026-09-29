import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { auditCreate, auditLog, auditExport } from "@/lib/services/audit-service";
import { requireAuth } from "@/lib/api-auth";

// ─── GET: Return articles, categories, FAQs, and stats ─────────
export async function GET(req: NextRequest) {
  try {
    await requireAuth(req);
    const { searchParams } = new URL(req.url);
    const type = searchParams.get("type");
    const search = searchParams.get("search") || "";
    const category = searchParams.get("category") || "";

    if (type === "articles") {
      const articles = await db.kbArticle.findMany({
        include: { KbCategory: true },
        orderBy: { updatedAt: "desc" },
      });
      return NextResponse.json({ articles });
    }

    if (type === "categories") {
      const categories = await db.kbCategory.findMany({
        include: {
          _count: { select: { KbArticle: true } },
          other_KbCategory: { include: { _count: { select: { KbArticle: true } } } },
        },
        orderBy: { sortOrder: "asc" },
      });
      return NextResponse.json({ categories });
    }

    if (type === "faqs") {
      const where: Record<string, unknown> = {};
      if (search) {
        where.OR = [
          { question: { contains: search } },
          { answer: { contains: search } },
        ];
      }
      if (category) {
        where.category = category;
      }
      const faqs = await db.faq.findMany({
        where: Object.keys(where).length > 0 ? where : undefined,
        orderBy: { sortOrder: "asc" },
      });
      return NextResponse.json({ faqs });
    }

    if (type === "article-versions") {
      const articleId = searchParams.get("articleId") || "";
      if (!articleId) {
        return NextResponse.json({ error: "articleId is required" }, { status: 400 });
      }
      const versions = await db.kbArticleVersion.findMany({
        where: { articleId },
        orderBy: { version: "desc" },
      });
      return NextResponse.json({ versions });
    }

    if (type === "tags") {
      const articles = await db.kbArticle.findMany({ select: { tags: true } });
      const tagSet = new Set<string>();
      for (const a of articles) {
        try {
          const tags = JSON.parse(a.tags || "[]");
          for (const t of tags) tagSet.add(t);
        } catch { /* ignore */ }
      }
      return NextResponse.json({ tags: Array.from(tagSet).sort() });
    }

    // Default: return everything with stats
    const [articles, categories, faqs] = await Promise.all([
      db.kbArticle.findMany({
        include: { KbCategory: true },
        orderBy: { updatedAt: "desc" },
      }),
      db.kbCategory.findMany({
        include: {
          _count: { select: { KbArticle: true } },
          other_KbCategory: { include: { _count: { select: { KbArticle: true } } } },
        },
        orderBy: { sortOrder: "asc" },
      }),
      db.faq.findMany({ orderBy: { sortOrder: "asc" } }),
    ]);

    const published = articles.filter((a) => a.status === "PUBLISHED").length;
    const totalViews = articles.reduce((s, a) => s + a.views, 0);
    const totalHelpful = articles.reduce((s, a) => s + (a.helpfulVotes || 0), 0);

    // Collect all unique tags
    const allTags = new Set<string>();
    for (const a of articles) {
      try {
        const tags = JSON.parse(a.tags || "[]");
        for (const t of tags) allTags.add(t);
      } catch { /* ignore */ }
    }

    return NextResponse.json({
      articles,
      categories,
      faqs,
      stats: {
        totalArticles: articles.length,
        published,
        categories: categories.length,
        totalViews,
        totalHelpful,
      },
      tags: Array.from(allTags).sort(),
    });
  } catch (error) {
    console.error("Knowledge Base API error:", error);
    return NextResponse.json(
      { error: "Failed to fetch knowledge base data" },
      { status: 500 }
    );
  }
}

// ─── POST: Create/delete articles, categories, FAQs ────────────
export async function POST(request: NextRequest) {
  try {
    await requireAuth(request);
    const body = await request.json();
    const { action, type, data } = body;

    if (action === "create-article") {
      const slug = data.slug || data.title?.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || `article-${Date.now()}`;
      const article = await db.kbArticle.create({
        data: {
          title: data.title || "Untitled Article",
          content: data.content || "",
          categoryId: data.categoryId || null,
          status: data.status || "DRAFT",
          tags: data.tags ? JSON.stringify(data.tags) : "[]",
          createdById: data.createdById || null,
          slug,
          metaTitle: data.metaTitle || "",
          metaDescription: data.metaDescription || "",
        },
        include: { KbCategory: true },
      });

      // Create initial version
      await db.kbArticleVersion.create({
        data: {
          articleId: article.id,
          version: 1,
          title: article.title,
          content: article.content,
          tags: article.tags,
          changeNote: "Initial version",
        },
      });

      await auditCreate(request, "KbArticle", article.id, { action: "create-article", title: data.title });
      return NextResponse.json({ success: true, article });
    }

    if (action === "update-article") {
      if (!body.id) return NextResponse.json({ error: "Article ID is required" }, { status: 400 });

      // Get current version for versioning
      const currentArticle = await db.kbArticle.findUnique({ where: { id: body.id } });
      if (!currentArticle) return NextResponse.json({ error: "Article not found" }, { status: 404 });

      // Save current state as a version before updating
      const nextVersion = (currentArticle.version || 0) + 1;
      await db.kbArticleVersion.create({
        data: {
          articleId: body.id,
          version: currentArticle.version || 1,
          title: currentArticle.title,
          content: currentArticle.content,
          tags: currentArticle.tags,
          changeNote: data.changeNote || `Version ${currentArticle.version}`,
        },
      });

      const slug = data.slug || currentArticle.slug;
      const article = await db.kbArticle.update({
        where: { id: body.id },
        data: {
          title: data.title || undefined,
          content: data.content || undefined,
          categoryId: data.categoryId !== undefined ? data.categoryId : undefined,
          status: data.status || undefined,
          tags: data.tags ? JSON.stringify(data.tags) : undefined,
          slug: slug || undefined,
          metaTitle: data.metaTitle !== undefined ? data.metaTitle : undefined,
          metaDescription: data.metaDescription !== undefined ? data.metaDescription : undefined,
          version: nextVersion,
        },
        include: { KbCategory: true },
      });
      await auditLog(request, "UPDATE", "KbArticle", body.id, { title: data.title, version: nextVersion });
      return NextResponse.json({ success: true, article });
    }

    if (action === "vote-article") {
      if (!body.id) return NextResponse.json({ error: "Article ID is required" }, { status: 400 });
      const { voteType } = body;
      const article = await db.kbArticle.findUnique({ where: { id: body.id } });
      if (!article) return NextResponse.json({ error: "Article not found" }, { status: 404 });

      const currentVotes = article.helpfulVotes || 0;
      await db.kbArticle.update({
        where: { id: body.id },
        data: { helpfulVotes: voteType === "up" ? currentVotes + 1 : Math.max(0, currentVotes - 1) },
      });
      return NextResponse.json({ success: true });
    }

    if (action === "increment-views") {
      if (!body.id) return NextResponse.json({ error: "Article ID is required" }, { status: 400 });
      await db.kbArticle.update({
        where: { id: body.id },
        data: { views: { increment: 1 } },
      });
      return NextResponse.json({ success: true });
    }

    if (action === "create-category") {
      const category = await db.kbCategory.create({
        data: {
          name: data.name || "Untitled Category",
          description: data.description || "",
          icon: data.icon || "FileText",
          sortOrder: data.sortOrder || 0,
          parentId: data.parentId || null,
        },
        include: { _count: { select: { KbArticle: true } }, other_KbCategory: true },
      });
      await auditCreate(request, "KbCategory", category.id, { action: "create-category", name: data.name });
      return NextResponse.json({ success: true, category });
    }

    if (action === "create-faq") {
      const faq = await db.faq.create({
        data: {
          question: data.question || "",
          answer: data.answer || "",
          category: data.category || "General",
          sortOrder: data.sortOrder || 0,
          status: data.status || "active",
        },
      });
      await auditCreate(request, "Faq", faq.id, { action: "create-faq", question: data.question });
      return NextResponse.json({ success: true, faq });
    }

    if (action === "update-faq") {
      if (!body.id) return NextResponse.json({ error: "FAQ ID is required" }, { status: 400 });
      const faq = await db.faq.update({
        where: { id: body.id },
        data: {
          question: data.question || undefined,
          answer: data.answer || undefined,
          category: data.category || undefined,
          sortOrder: data.sortOrder || undefined,
          status: data.status || undefined,
        },
      });
      return NextResponse.json({ success: true, faq });
    }

    if (action === "update-category") {
      if (!body.id) return NextResponse.json({ error: "Category ID is required" }, { status: 400 });
      const category = await db.kbCategory.update({
        where: { id: body.id },
        data: {
          name: data.name || undefined,
          icon: data.icon || undefined,
          description: data.description || undefined,
          sortOrder: data.sortOrder || undefined,
          parentId: data.parentId !== undefined ? data.parentId : undefined,
        },
        include: { _count: { select: { KbArticle: true } } },
      });
      return NextResponse.json({ success: true, category });
    }

    if (action === "reorder-faqs") {
      const { faqIds } = body;
      if (!Array.isArray(faqIds) || faqIds.length === 0) {
        return NextResponse.json({ error: "faqIds array is required" }, { status: 400 });
      }
      await Promise.all(
        faqIds.map((id: string, index: number) =>
          db.faq.update({
            where: { id },
            data: { sortOrder: index + 1 },
          })
        )
      );
      await auditLog(request, "UPDATE", "Faq", "bulk", { action: "reorder-faqs", count: faqIds.length });
      return NextResponse.json({ success: true });
    }

    if (action === "import") {
      const { content, format, title, categoryId } = body;
      if (!content || !title) {
        return NextResponse.json({ error: "Content and title are required" }, { status: 400 });
      }

      let processedContent = content;
      if (format === "markdown") {
        // Basic markdown to text conversion (preserve as-is for now)
        processedContent = content;
      }

      const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || `article-${Date.now()}`;

      const article = await db.kbArticle.create({
        data: {
          title,
          content: processedContent,
          categoryId: categoryId || null,
          status: "DRAFT",
          tags: JSON.stringify(["imported"]),
          slug,
          metaTitle: title,
          metaDescription: processedContent.substring(0, 160),
        },
        include: { KbCategory: true },
      });

      await db.kbArticleVersion.create({
        data: {
          articleId: article.id,
          version: 1,
          title: article.title,
          content: article.content,
          tags: article.tags,
          changeNote: "Imported",
        },
      });

      await auditLog(request, "IMPORT", "KbArticle", article.id, { title, format });
      return NextResponse.json({ success: true, article });
    }

    if (action === "delete") {
      if (!body.id || !type) {
        return NextResponse.json(
          { error: "id and type are required for delete" },
          { status: 400 }
        );
      }

      switch (type) {
        case "article":
          await db.kbArticleVersion.deleteMany({ where: { articleId: body.id } });
          await db.kbArticle.delete({ where: { id: body.id } });
          break;
        case "category":
          await db.kbCategory.delete({ where: { id: body.id } });
          break;
        case "faq":
          await db.faq.delete({ where: { id: body.id } });
          break;
        default:
          return NextResponse.json(
            { error: "Invalid type for delete. Use article, category, or faq" },
            { status: 400 }
          );
      }

      await auditLog(request, "DELETE", "KnowledgeBase", body.id, { type });
      return NextResponse.json({ success: true, deletedId: body.id });
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  } catch (error) {
    console.error("Knowledge Base POST error:", error);
    return NextResponse.json(
      { error: "Failed to process action" },
      { status: 500 }
    );
  }
}
