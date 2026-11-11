import { useEffect, useState } from 'react';
import type { BlogPost as BlogPostType } from '../../lib/blog';
import { formatPostDate, calculateReadingTime } from '../../lib/blog';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

/**
 * BlogPost Component Props
 */
interface BlogPostProps {
  /** Blog post data to display */
  post: BlogPostType;
}

/**
 * BlogPost Component
 *
 * Displays a full blog post with metadata, content, and navigation.
 * Features reading progress indicator, decorative elements, and stylish typography.
 * Automatically inherits site colors from CSS variables.
 *
 * @param props - Component props
 * @returns BlogPost component
 */
export default function BlogPost({ post }: BlogPostProps) {
  const readingTime = calculateReadingTime(post.content);
  const formattedDate = formatPostDate(post.publishedAt, 'full');
  const updatedDate = post.updatedAt ? formatPostDate(post.updatedAt, 'long') : null;

  const [scrollProgress, setScrollProgress] = useState(0);

  useEffect(() => {
    const handleScroll = () => {
      const windowHeight = window.innerHeight;
      const documentHeight = document.documentElement.scrollHeight - windowHeight;
      const scrolled = window.scrollY;
      const progress = (scrolled / documentHeight) * 100;
      setScrollProgress(Math.min(100, Math.max(0, progress)));
    };

    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  return (
    <>
      {/* Reading Progress Bar */}
      <div className="fixed top-0 left-0 right-0 z-50 h-1 bg-border/30">
        <div
          className="h-full bg-gradient-to-r from-primary via-primary/80 to-primary transition-all duration-150 ease-out"
          style={{ width: `${scrollProgress}%` }}
        />
      </div>

      <article className="relative">
        {/* Decorative background elements */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none" aria-hidden="true">
          <div className="absolute -top-40 -right-40 w-96 h-96 bg-primary/5 rounded-full blur-3xl" />
          <div className="absolute top-1/3 -left-40 w-80 h-80 bg-accent/5 rounded-full blur-3xl" />
          <div className="absolute bottom-1/4 -right-32 w-72 h-72 bg-primary/5 rounded-full blur-3xl" />
        </div>

        <div className="relative max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12 lg:py-20">
          {/* Header Section with Visual Flair */}
          <header className="mb-16 lg:mb-24">
            <div className="text-center">
              {post.category && (
                <div className="mb-8 animate-fade-in">
                  <span className="inline-flex items-center gap-2 px-6 py-2.5 text-xs font-bold tracking-widest uppercase text-primary bg-gradient-to-r from-primary/10 to-primary/5 rounded-full border-2 border-primary/20 shadow-lg shadow-primary/10">
                    <span className="w-2 h-2 rounded-full bg-primary animate-pulse" />
                    {post.category}
                  </span>
                </div>
              )}

              <h1 className="page-title mb-10">{post.title}</h1>

              {post.excerpt && (
                <p className="text-lg text-muted-foreground mb-12 max-w-3xl mx-auto leading-relaxed font-light">
                  {post.excerpt}
                </p>
              )}

              {/* Enhanced Metadata Card */}
              <div className="inline-flex items-center gap-4 px-8 py-4 bg-accent/30 rounded-2xl border-2 border-border/50 shadow-xl backdrop-blur-sm">
                {post.author && (
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-full bg-gradient-to-br from-primary to-primary/70 flex items-center justify-center shadow-lg">
                      <span className="text-lg font-bold text-white">
                        {post.author.charAt(0).toUpperCase()}
                      </span>
                    </div>
                    <span className="font-bold text-foreground tracking-wide">{post.author}</span>
                  </div>
                )}
                <span className="text-border text-2xl">•</span>
                <time
                  dateTime={post.publishedAt}
                  className="tracking-wide text-muted-foreground font-medium"
                >
                  {formattedDate}
                </time>
                <span className="text-border text-2xl">•</span>
                <span className="tracking-wide text-muted-foreground font-medium flex items-center gap-2">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                    />
                  </svg>
                  {readingTime} min read
                </span>
              </div>

              {updatedDate && (
                <div className="mt-6 text-sm text-muted-foreground/80 italic">
                  Last updated: {updatedDate}
                </div>
              )}
            </div>
          </header>

          {/* Featured Image with Frame */}
          {post.featuredImage && (
            <div className="mb-20 lg:mb-28 relative group">
              <div className="absolute -inset-4 bg-gradient-to-r from-primary/20 to-accent/20 rounded-3xl blur-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
              <div className="relative rounded-3xl overflow-hidden shadow-2xl ring-1 ring-border/50">
                <img
                  src={post.featuredImage}
                  alt={post.title}
                  className="w-full h-auto object-cover transform group-hover:scale-[1.02] transition-transform duration-700"
                  loading="eager"
                />
              </div>
            </div>
          )}

          {/* Main Content with Drop Cap and Enhanced Styling */}
          <div className="relative">
            {/* Side decoration line */}
            <div className="hidden lg:block absolute -left-20 top-0 bottom-0 w-1 bg-gradient-to-b from-transparent via-primary/30 to-transparent" />

            <div
              className="rich-text"
              data-dev-content-file={`src/content/data/blog/${post.slug}.md`}
            >
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{post.content}</ReactMarkdown>
            </div>
          </div>

          {/* Tags Section with Visual Interest */}
          {post.tags && post.tags.length > 0 && (
            <div className="mt-24 pt-12 border-t-2 border-border/50 relative">
              <div className="absolute -top-4 left-1/2 -translate-x-1/2 px-6 py-2 bg-background">
                <div className="flex gap-2">
                  <div className="w-2 h-2 rounded-full bg-primary" />
                  <div className="w-2 h-2 rounded-full bg-primary/60" />
                  <div className="w-2 h-2 rounded-full bg-primary/30" />
                </div>
              </div>

              <div className="text-center mb-8">
                <h3 className="text-sm font-black uppercase tracking-[0.2em] text-muted-foreground">
                  Explore Topics
                </h3>
              </div>

              <div className="flex flex-wrap justify-center gap-4">
                {post.tags.map((tag) => (
                  <span
                    key={tag}
                    className="group relative px-6 py-3 text-sm font-bold bg-gradient-to-br from-accent/50 to-accent/30 text-foreground rounded-xl border-2 border-border/50 hover:border-primary hover:shadow-lg hover:shadow-primary/20 hover:-translate-y-0.5 transition-all duration-200 cursor-pointer overflow-hidden"
                  >
                    <span className="absolute inset-0 bg-gradient-to-br from-primary/0 to-primary/0 group-hover:from-primary/10 group-hover:to-primary/5 transition-all duration-200" />
                    <span className="relative">#{tag}</span>
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Author Bio with Visual Flair */}
          {post.author && (
            <div className="mt-24 pt-12 border-t-2 border-border/50 relative">
              <div className="absolute -top-4 left-1/2 -translate-x-1/2 px-6 py-2 bg-background">
                <div className="w-8 h-1 bg-gradient-to-r from-transparent via-primary to-transparent rounded-full" />
              </div>

              <div className="relative p-10 bg-gradient-to-br from-accent/40 via-accent/20 to-transparent rounded-3xl border-2 border-border/50 shadow-2xl overflow-hidden">
                {/* Decorative corner elements */}
                <div className="absolute top-0 right-0 w-32 h-32 bg-primary/5 rounded-bl-full" />
                <div className="absolute bottom-0 left-0 w-24 h-24 bg-accent/10 rounded-tr-full" />

                <div className="relative flex items-start gap-8">
                  <div className="flex-shrink-0 relative group">
                    <div className="absolute -inset-2 bg-gradient-to-br from-primary to-primary/50 rounded-full blur opacity-50 group-hover:opacity-75 transition-opacity" />
                    <div className="relative w-24 h-24 rounded-full bg-gradient-to-br from-primary to-primary/70 flex items-center justify-center shadow-xl ring-4 ring-background">
                      <span className="text-2xl font-black text-white">
                        {post.author.charAt(0).toUpperCase()}
                      </span>
                    </div>
                  </div>

                  <div className="flex-1">
                    <p className="text-xs font-black uppercase tracking-[0.2em] text-muted-foreground mb-3">
                      Written by
                    </p>
                    <h3 className="text-xl font-black text-foreground mb-3">{post.author}</h3>
                    <p className="text-lg text-muted-foreground leading-relaxed">
                      Content creator and writer sharing insights and stories.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </article>
    </>
  );
}
