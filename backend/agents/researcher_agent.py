from __future__ import annotations

import re
from typing import Any
from urllib.parse import urlparse

from tools.serper_tool import SerperTool
from tools.tavily_tool import TavilyTool


def clean_name(name: str) -> str:
    if not name:
        return name

    words = name.split()
    seen: list[str] = []
    for word in words:
        if word not in seen:
            seen.append(word)

    return " ".join(seen)


def is_valid_person_name(name: str) -> bool:
    if not name:
        return False

    normalized_name = name.strip()
    if len(normalized_name) < 4 or len(normalized_name) > 50:
        return False

    for prefix in ["View ", "Connect with ", "Follow ", "Message "]:
        if normalized_name.startswith(prefix):
            return False

    location_keywords = [
        "bay",
        "new york",
        "san francisco",
        "bangalore",
        "mumbai",
        "delhi",
        "chennai",
        "hyderabad",
        "pune",
        "london",
        "boston",
        "area",
        "region",
        "city",
        "india",
        "united states",
    ]
    name_lower = normalized_name.lower()
    if any(location in name_lower for location in location_keywords):
        return False

    words = normalized_name.split()
    if len(words) < 2:
        return False
    if len(words) > 4:
        return False

    invalid_standalone_words = {
        "mahavidyalaya",
        "university",
        "college",
        "institute",
        "community",
        "lead",
        "manager",
    }
    normalized_words = [re.sub(r"[^A-Za-z-]", "", word).lower() for word in words]
    if any(word in invalid_standalone_words for word in normalized_words if word):
        return False

    if not all(word and word[0].isupper() for word in words):
        return False

    if any(char.isdigit() for char in normalized_name):
        return False

    title_keywords = {
        "ceo",
        "founder",
        "co-founder",
        "cofounder",
        "cto",
        "cmo",
        "cro",
        "vp",
        "head",
        "director",
        "manager",
    }
    if any(word.lower() in title_keywords for word in words):
        return False

    return True


def is_valid_pain_point(pain: str) -> bool:
    if not pain:
        return False

    normalized_pain = pain.strip()
    if len(normalized_pain) < 10:
        return False

    invalid_patterns = [
        r"^\d+\s",
        r"top \d+",
        r"best \d+",
        r"\$\d+",
        r"have secured",
        r"raises? \$",
        r"joins? \$",
        r"hiring now",
        r"join .+ as a",
        r"discover all",
        r"list of the",
        r"explore how",
    ]

    pain_lower = normalized_pain.lower()
    for pattern in invalid_patterns:
        if re.search(pattern, pain_lower):
            return False

    return True


# Model: gemini-2.5-flash (speed-optimized)
class ResearcherAgent:
    """Lead Researcher: deep enriches each company with buying context."""

    name = "Lead Researcher"
    goal = (
        "For each lead, deep research the company -- size, tech stack, recent activity, "
        "decision maker name"
    )

    _SIZE_PATTERN = re.compile(
        r"(\b\d{1,4}\s?(?:-|to)\s?\d{1,4}\b|\b\d{2,5}\+?\b)\s+employees",
        re.IGNORECASE,
    )
    _DECISION_MAKER_PATTERN = re.compile(
        r"([A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,2})\s*(?:,|\||-)\s*"
        r"(CEO|Founder|Co-Founder|CTO|CRO|CMO|Head of [A-Za-z ]+|VP [A-Za-z ]+)",
        re.IGNORECASE,
    )
    _PERSON_NAME_PATTERN = re.compile(r"\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,2})\b")
    _TITLE_PATTERN = re.compile(
        r"\b(CEO|Chief Executive Officer|Founder|Co-Founder|CTO|Chief Technology Officer)\b",
        re.IGNORECASE,
    )
    _EMAIL_PATTERN = re.compile(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}")
    _NAME_STOPWORDS = {
        "linkedin",
        "profile",
        "founder",
        "co",
        "ceo",
        "cto",
        "chief",
        "executive",
        "officer",
        "technology",
        "contact",
        "email",
        "india",
        "company",
        "technologies",
        "solutions",
        "systems",
        "labs",
        "software",
        "services",
        "startup",
        "limited",
        "ltd",
        "inc",
        "private",
        "pvt",
    }
    _COMPANY_SUFFIX_TOKENS = {
        "web",
        "design",
        "tech",
        "solutions",
        "services",
        "systems",
        "group",
        "agency",
        "studio",
        "digital",
        "media",
        "consulting",
        "global",
        "india",
        "labs",
        "automation",
        "unlimited",
        "calling",
        "voice",
        "agent",
        "platform",
        "tool",
        "tools",
        "ai",
        "saas",
        "crm",
    }
    _JOB_TITLE_TOKENS = {
        "developer",
        "engineer",
        "designer",
        "analyst",
        "manager",
        "specialist",
        "consultant",
        "intern",
    }
    _GENERIC_PAIN_PHRASES = {
        "likely struggles",
        "probably needs",
        "as a growing",
        "likely needs",
        "may struggle",
        "might struggle",
    }
    _INVALID_DECISION_MAKER_NAME_TERMS = {
        "institute",
        "university",
        "college",
        "department",
        "foundation",
        "association",
        "committee",
        "school",
        "academy",
    }
    _TECH_KEYWORDS = {
        "python": "Python",
        "django": "Django",
        "fastapi": "FastAPI",
        "node": "Node.js",
        "react": "React",
        "next.js": "Next.js",
        "kubernetes": "Kubernetes",
        "docker": "Docker",
        "aws": "AWS",
        "gcp": "GCP",
        "azure": "Azure",
        "salesforce": "Salesforce",
        "hubspot": "HubSpot",
        "snowflake": "Snowflake",
        "postgres": "PostgreSQL",
    }
    _SOCIAL_DOMAINS = {
        "linkedin.com",
        "reddit.com",
        "x.com",
        "twitter.com",
        "facebook.com",
        "instagram.com",
        "youtube.com",
    }
    _PAIN_SIGNAL_PATTERNS = [
        re.compile(r"challeng\w+", re.IGNORECASE),
        re.compile(r"struggl\w+", re.IGNORECASE),
        re.compile(r"problem\w*", re.IGNORECASE),
        re.compile(r"difficult\w*", re.IGNORECASE),
        re.compile(r"bottleneck\w*", re.IGNORECASE),
        re.compile(r"manual\w*", re.IGNORECASE),
        re.compile(r"time.consuming", re.IGNORECASE),
        re.compile(r"inefficien\w+", re.IGNORECASE),
        re.compile(r"growing fast", re.IGNORECASE),
        re.compile(r"scaling", re.IGNORECASE),
        re.compile(r"expand\w+", re.IGNORECASE),
        re.compile(r"hiring", re.IGNORECASE),
        re.compile(r"automat\w+", re.IGNORECASE),
        re.compile(r"integrat\w+", re.IGNORECASE),
        re.compile(r"workflow\w*", re.IGNORECASE),
        re.compile(r"pipeline\w*", re.IGNORECASE),
        re.compile(r"process\w+", re.IGNORECASE),
    ]

    def __init__(
        self,
        serper_tool: SerperTool | None = None,
        tavily_tool: TavilyTool | None = None,
        gemini_llm: Any | None = None,
    ) -> None:
        self.serper_tool = serper_tool or SerperTool()
        self.tavily_tool = tavily_tool or TavilyTool()
        self.gemini_llm = gemini_llm
        # Keep factual agent calls deterministic when Gemini is used.
        self.generation_config = {"temperature": 0.1}

    def enrich(self, lead: dict[str, Any]) -> dict[str, Any]:
        company_name = str(lead.get("company_name") or lead.get("company") or "Unknown Company")
        lead_url = str(lead.get("url") or lead.get("website") or "")
        company_site = self._resolve_company_site(company_name=company_name, fallback_url=lead_url)
        domain = self._extract_domain(company_site or lead_url)
        company_domain = domain if domain and domain not in self._SOCIAL_DOMAINS else ""

        website_query = (
            f"site:{company_domain} {company_name} about team engineering technology stack customers"
            if company_domain
            else f"{company_name} company profile team products"
        )
        website_results = self.tavily_tool.search(query=website_query, max_results=5)

        linkedin_query = (
            f"site:linkedin.com {company_name} CEO OR Founder OR CTO OR VP Sales"
        )
        linkedin_results = self.tavily_tool.search(query=linkedin_query, max_results=5)

        activity_query = f"{company_name} funding launch hiring expansion partnership"
        activity_results = self.tavily_tool.search(query=activity_query, max_results=4)

        source_url = self._pick_primary_source_url(
            preferred_urls=[company_site, lead_url],
            research_results=website_results + linkedin_results + activity_results,
        )

        decision_profile = self._find_decision_maker_profile(
            company_name=company_name,
            domain=company_domain,
        )
        decision_maker_name = str(decision_profile.get("name", "")).strip()
        decision_maker_name = clean_name(decision_maker_name.replace("View ", "").strip())
        decision_maker_title = str(decision_profile.get("title", "")).strip()
        linkedin_url = str(decision_profile.get("url", "")).strip()
        decision_maker_source = str(decision_profile.get("source_url", "")).strip()
        if not decision_maker_source and linkedin_url:
            decision_maker_source = linkedin_url

        size, size_source = self._infer_company_size(website_results + linkedin_results + activity_results)
        tech_stack, tech_stack_sources = self._infer_tech_stack(website_results + activity_results)
        pain_point, pain_point_source = self._infer_pain_point(
            lead=lead,
            research_results=website_results + linkedin_results + activity_results,
        )
        if not pain_point and self.gemini_llm is not None:
            company_description = self._build_company_description(website_results + activity_results)
            industry = self._infer_industry(lead, company_description)
            generated_pain_point = self._generate_specific_pain_point(
                company_name=company_name,
                company_description=company_description,
                industry=industry,
            )
            if generated_pain_point:
                pain_point = generated_pain_point
                pain_point_source = source_url

        decision_maker: str | None = decision_maker_name or None
        if not is_valid_person_name(decision_maker) or self._is_invalid_decision_maker_name(
            decision_maker or ""
        ):
            decision_maker = None
            decision_maker_title = ""
            linkedin_url = ""
            decision_maker_source = ""

        if decision_maker and not decision_maker_source:
            decision_maker_source = source_url or ""

        email_value, email_source, email_search_results = self._infer_email_hint(
            company_name=company_name,
            decision_maker_name=decision_maker_name,
            domain=company_domain,
            contact_hint=str(lead.get("contact_hint", "")),
            lead_source_url=source_url,
        )
        email_hint_confidence = "found" if email_value else "none"
        recent_activity = self._recent_activity_summary(activity_results)

        enriched = dict(lead)
        enriched.update(
            {
                "company": company_name,
                "company_name": company_name,
                "source_url": source_url,
                "size": size,
                "size_source": size_source,
                "tech_stack": tech_stack,
                "tech_stack_sources": tech_stack_sources,
                "pain_point": pain_point,
                "pain_point_source": pain_point_source,
                "decision_maker": decision_maker,
                "decision_maker_title": decision_maker_title or None,
                "decision_maker_source": decision_maker_source or None,
                "email": email_value,
                "email_source": email_source,
                "email_hint": email_value or "Unknown",
                "email_hint_confidence": email_hint_confidence,
                "linkedin_url": linkedin_url or None,
                "website": company_site or lead_url or None,
                "domain": domain or None,
                "recent_activity": recent_activity,
                "research": {
                    "website_results": website_results,
                    "linkedin_results": linkedin_results,
                    "activity_results": activity_results,
                    "linkedin_profile_result": decision_profile,
                    "email_results": email_search_results,
                },
                "research_sources": {
                    "source_url": source_url,
                    "size_source": size_source,
                    "tech_stack_sources": tech_stack_sources,
                    "pain_point_source": pain_point_source,
                    "decision_maker_source": decision_maker_source or None,
                    "email_source": email_source,
                },
            }
        )
        return enriched

    def _resolve_company_site(self, company_name: str, fallback_url: str) -> str:
        fallback_domain = self._extract_domain(fallback_url)
        if fallback_url and fallback_domain and fallback_domain not in self._SOCIAL_DOMAINS:
            return fallback_url

        website_results = self.tavily_tool.search(
            query=f"{company_name} official website",
            max_results=4,
        )
        for item in website_results:
            candidate_url = str(item.get("url", "")).strip()
            domain = self._extract_domain(candidate_url)
            if domain and domain not in self._SOCIAL_DOMAINS:
                return candidate_url

        return fallback_url

    def _infer_company_size(self, results: list[dict[str, Any]]) -> tuple[str | None, str | None]:
        for item in results:
            combined_text = f"{item.get('title', '')} {item.get('content', '')}".strip()
            if not combined_text:
                continue

            match = self._SIZE_PATTERN.search(combined_text)
            if not match:
                continue

            size_token = match.group(1).replace("to", "-").replace(" ", "")
            source_url = self._extract_result_source_url(item)
            return f"{size_token} employees", source_url

        return None, None

    def _infer_tech_stack(self, results: list[dict[str, Any]]) -> tuple[list[str] | None, list[str]]:
        stack: list[str] = []
        source_urls: list[str] = []

        for item in results:
            combined_text = f"{item.get('title', '')} {item.get('content', '')}".lower().strip()
            if not combined_text:
                continue

            source_url = self._extract_result_source_url(item)
            for needle, normalized in self._TECH_KEYWORDS.items():
                if needle not in combined_text or normalized in stack:
                    continue

                stack.append(normalized)
                if source_url and source_url not in source_urls:
                    source_urls.append(source_url)

        if stack:
            return stack[:8], source_urls[:8]
        return None, []

    def _infer_pain_point(
        self,
        lead: dict[str, Any],
        research_results: list[dict[str, Any]],
    ) -> tuple[str | None, str | None]:
        company_name = str(lead.get("company_name") or lead.get("company") or "this company").strip()
        if not company_name:
            company_name = "this company"

        snippet_candidates: list[tuple[str, str | None]] = []
        lead_signal = str(lead.get("pain_signal") or "").strip()
        if lead_signal:
            lead_source = str(lead.get("source_url") or lead.get("url") or lead.get("website") or "").strip()
            snippet_candidates.append((lead_signal, lead_source or None))

        for item in research_results:
            if not isinstance(item, dict):
                continue

            title = str(item.get("title") or "").strip()
            snippet = str(item.get("snippet") or "").strip()
            content = str(item.get("content") or "").strip()
            combined = " ".join(part for part in (title, snippet, content) if part).strip()
            if combined:
                snippet_candidates.append((combined, self._extract_result_source_url(item)))

        seen_snippets: set[str] = set()
        for raw_snippet, source_url in snippet_candidates:
            normalized_snippet = re.sub(r"\s+", " ", raw_snippet).strip()
            if not normalized_snippet or normalized_snippet in seen_snippets:
                continue
            seen_snippets.add(normalized_snippet)

            if not self._contains_pain_signal(normalized_snippet):
                continue

            candidate_pain = self._extract_clean_pain_point(normalized_snippet)
            if candidate_pain and is_valid_pain_point(candidate_pain):
                return candidate_pain, source_url

        return None, None

    def _contains_pain_signal(self, text: str) -> bool:
        lowered_text = text.lower().strip()
        if not lowered_text:
            return False
        return any(pattern.search(lowered_text) for pattern in self._PAIN_SIGNAL_PATTERNS)

    def _extract_clean_pain_point(self, snippet: str) -> str:
        normalized = re.sub(r"\s+", " ", snippet).strip()
        if not normalized:
            return ""

        sentences = [
            sentence.strip(" -|,.;")
            for sentence in re.split(r"(?<=[.!?])\s+", normalized)
            if sentence.strip()
        ]
        if not sentences:
            return ""

        signal_sentences = [
            sentence for sentence in sentences if self._contains_pain_signal(sentence)
        ]
        selected = signal_sentences[:2] if signal_sentences else sentences[:2]
        candidate = " ".join(selected).strip()
        if not candidate:
            return ""
        if candidate[-1] not in ".!?":
            candidate = f"{candidate}."
        return candidate[:280]

    def _build_company_description(self, research_results: list[dict[str, Any]]) -> str:
        snippets: list[str] = []
        for item in research_results:
            if not isinstance(item, dict):
                continue
            title = str(item.get("title") or "").strip()
            content = str(item.get("content") or item.get("snippet") or "").strip()
            combined = " ".join(part for part in (title, content) if part).strip()
            if combined:
                snippets.append(combined)
            if len(snippets) >= 3:
                break
        return " ".join(snippets)

    def _infer_industry(self, lead: dict[str, Any], company_description: str) -> str:
        for field in ("industry", "niche", "category"):
            value = str(lead.get(field) or "").strip()
            if value:
                return value

        description = company_description.lower()
        inferred_industries = {
            "saas": "SaaS",
            "fintech": "fintech",
            "health": "healthcare",
            "ecommerce": "ecommerce",
            "logistics": "logistics",
            "recruit": "recruitment",
            "education": "education",
            "real estate": "real estate",
            "manufacturing": "manufacturing",
        }
        for keyword, industry in inferred_industries.items():
            if keyword in description:
                return industry

        return ""

    def _generate_specific_pain_point(
        self,
        company_name: str,
        company_description: str,
        industry: str,
    ) -> str:
        if self.gemini_llm is None:
            return ""

        prompt = (
            "You are a B2B sales researcher. Based on ONLY the verified company data below, "
            "write ONE specific sentence about a real operational pain point this company faces.\n\n"
            f"Company: {company_name}\n"
            f"Description: {company_description or 'Not available'}\n"
            f"Industry: {industry or 'Unknown'}\n\n"
            "STRICT RULES:\n"
            "1. Only use information from the description above\n"
            "2. Be specific to their actual business, not generic\n"
            "3. NEVER use phrases like 'likely struggles', 'probably needs', 'as a growing company'\n"
            "4. If description is empty or vague, return exactly: INSUFFICIENT_DATA\n"
            "5. Max 1 sentence, under 150 characters\n"
            "6. Focus on: outbound sales, lead generation, client acquisition, or scaling\n\n"
            "Examples of GOOD output:\n"
            "- 'Manual client onboarding slows their web agency delivery pipeline.'\n"
            "- 'Scaling outbound for enterprise SaaS without burning SDR bandwidth.'\n\n"
            "Examples of BAD output (never do this):\n"
            "- 'As a growing B2B company, they likely struggle with...'\n"
            "- 'They probably need AI automation'\n"
        )

        response: Any = None
        for method_name in ("generate_content", "generate", "invoke", "complete", "predict"):
            method = getattr(self.gemini_llm, method_name, None)
            if not callable(method):
                continue

            invocation_attempts = (
                {"contents": prompt, "generation_config": self.generation_config},
                {"prompt": prompt, "generation_config": self.generation_config},
                {"contents": prompt, "config": self.generation_config},
                {"prompt": prompt, "config": self.generation_config},
                {"contents": prompt},
                {"prompt": prompt},
            )

            try:
                for kwargs in invocation_attempts:
                    try:
                        response = method(**kwargs)
                    except TypeError:
                        continue
                    if response is not None:
                        break

                if response is not None:
                    break
            except Exception:
                continue

        if response is None and callable(self.gemini_llm):
            invocation_attempts = (
                {"prompt": prompt, "generation_config": self.generation_config},
                {"contents": prompt, "generation_config": self.generation_config},
            )
            for kwargs in invocation_attempts:
                try:
                    response = self.gemini_llm(**kwargs)
                except TypeError:
                    continue
                except Exception:
                    return ""
                if response is not None:
                    break

            if response is None:
                try:
                    response = self.gemini_llm(prompt)
                except Exception:
                    return ""

        generated_text = self._coerce_model_text(response)
        if not generated_text or "insufficient_data" in generated_text.lower():
            return ""

        if any(phrase in generated_text.lower() for phrase in self._GENERIC_PAIN_PHRASES):
            return ""

        single_sentence = re.split(r"(?<=[.!?])\s+", generated_text.strip())[0].strip()
        single_sentence = re.sub(r"\s+", " ", single_sentence)
        if not single_sentence:
            return ""
        if single_sentence[-1] not in ".!?":
            single_sentence = f"{single_sentence}."

        if any(phrase in single_sentence.lower() for phrase in self._GENERIC_PAIN_PHRASES):
            return ""

        return single_sentence[:150]

    def _coerce_model_text(self, response: Any) -> str:
        if response is None:
            return ""

        if isinstance(response, str):
            return response.strip()

        text_attr = getattr(response, "text", "")
        if isinstance(text_attr, str) and text_attr.strip():
            return text_attr.strip()

        if isinstance(response, dict):
            for key in ("text", "content", "output"):
                value = response.get(key)
                if isinstance(value, str) and value.strip():
                    return value.strip()

        candidates = getattr(response, "candidates", [])
        for candidate in candidates:
            content = getattr(candidate, "content", None)
            parts = getattr(content, "parts", []) if content else []
            for part in parts:
                part_text = getattr(part, "text", "")
                if isinstance(part_text, str) and part_text.strip():
                    return part_text.strip()

        return ""

    def _find_decision_maker_profile(self, company_name: str, domain: str) -> dict[str, str]:
        query = f"site:linkedin.com/in {company_name} founder OR CEO OR CTO"
        results = self.serper_tool.search(query=query, num_results=5)
        if not results:
            return {"name": "", "title": "", "url": "", "source_url": ""}

        name = ""
        title = ""
        linkedin_url = ""
        source_title = ""
        decision_maker_source_url = ""

        for item in results:
            if not isinstance(item, dict):
                continue

            raw_title = str(item.get("title", "")).strip()
            raw_snippet = str(item.get("snippet", "")).strip()
            raw_url = str(item.get("link", "")).strip()
            if raw_url and not self._is_probable_linkedin_profile_url(raw_url):
                continue

            candidate_name = self._extract_person_name(snippet=raw_snippet, title=raw_title)
            candidate_name = clean_name(candidate_name.replace("View ", "").strip())
            if not is_valid_person_name(candidate_name):
                continue

            name = candidate_name
            source_title = raw_title
            decision_maker_source_url = raw_url
            if "linkedin.com/in/" in raw_url:
                linkedin_url = raw_url

            combined_text = f"{raw_title} {raw_snippet}".strip()
            title = self._extract_linkedin_title(
                name=name,
                company_name=company_name,
                text=combined_text,
            )
            if not title:
                title = self._extract_decision_maker_title(raw_title=raw_title, raw_snippet=raw_snippet)
            break

        if name:
            title_query = f"site:linkedin.com/in {name} {company_name}"
            title_results = self.serper_tool.search(query=title_query, num_results=5)
            for item in title_results:
                if not isinstance(item, dict):
                    continue

                raw_title = str(item.get("title", "")).strip()
                raw_snippet = str(item.get("snippet", "")).strip()
                raw_url = str(item.get("link", "")).strip()
                if raw_url and not self._is_probable_linkedin_profile_url(raw_url):
                    continue

                combined_text = f"{raw_title} {raw_snippet}".strip()

                extracted_title = self._extract_linkedin_title(
                    name=name,
                    company_name=company_name,
                    text=combined_text,
                )
                if extracted_title:
                    title = extracted_title

                if not decision_maker_source_url and raw_url:
                    decision_maker_source_url = raw_url

                if not linkedin_url and "linkedin.com/in/" in raw_url:
                    linkedin_url = raw_url

                if title and linkedin_url:
                    break

        return {
            "name": name,
            "title": title,
            "url": linkedin_url,
            "source_title": source_title,
            "source_url": decision_maker_source_url,
        }

    def _extract_linkedin_title(self, name: str, company_name: str, text: str) -> str:
        normalized_text = re.sub(r"\s+", " ", text).strip()
        if not normalized_text:
            return ""

        escaped_company = re.escape(company_name)
        escaped_name = re.escape(name)
        patterns = [
            rf"·\s*(.+?)\s*(?:at|@|-)\s*{escaped_company}",
            rf"{escaped_name}\s*[-·]\s*(.+?)\s*[-·|]",
        ]

        for pattern in patterns:
            match = re.search(pattern, normalized_text, re.IGNORECASE)
            if not match:
                continue

            extracted = re.sub(r"\s+", " ", match.group(1)).strip(" -|,")
            if not extracted:
                continue

            lowered = extracted.lower()
            if lowered in {"linkedin", "profile", "view"}:
                continue

            return extracted

        return ""

    def _infer_email_hint(
        self,
        company_name: str,
        decision_maker_name: str,
        domain: str,
        contact_hint: str,
        lead_source_url: str | None,
    ) -> tuple[str | None, str | None, list[dict[str, Any]]]:
        contact_email = self._extract_email(contact_hint)
        if contact_email:
            return contact_email, lead_source_url, []

        email_query = f"{company_name} founder email contact"
        email_results = self.serper_tool.search(query=email_query, num_results=5)
        for item in email_results:
            title = str(item.get("title", "")).strip()
            snippet = str(item.get("snippet", "")).strip()
            link = str(item.get("link", "")).strip()
            discovered_email = self._extract_email(f"{title} {snippet} {link}")
            if discovered_email:
                return discovered_email, (link or None), email_results

        return None, None, email_results

    def _extract_person_name(self, snippet: str, title: str) -> str:
        for text in (snippet, title):
            for candidate in self._PERSON_NAME_PATTERN.findall(text):
                normalized = " ".join(candidate.split()).strip()
                lowered_tokens = {token.lower() for token in normalized.split()}
                if lowered_tokens & self._NAME_STOPWORDS:
                    continue
                if len(normalized.split()) < 2:
                    continue

                if lowered_tokens & self._COMPANY_SUFFIX_TOKENS:
                    continue

                if lowered_tokens & self._JOB_TITLE_TOKENS:
                    continue

                return normalized
        return ""

    def _is_probable_linkedin_profile_url(self, url: str) -> bool:
        normalized = (self._normalize_url(url) or "").lower()
        if not normalized:
            return False

        if "linkedin.com/in/" not in normalized:
            return False

        blocked_paths = (
            "/company/",
            "/jobs/",
            "/posts/",
            "/pulse/",
            "/school/",
            "/feed/",
            "/groups/",
            "/showcase/",
        )
        if any(path in normalized for path in blocked_paths):
            return False

        return True

    def _extract_decision_maker_title(self, raw_title: str, raw_snippet: str) -> str:
        text = f"{raw_title} {raw_snippet}"
        match = self._TITLE_PATTERN.search(text)
        if not match:
            return ""

        raw_role = match.group(1).strip().lower()
        role_map = {
            "ceo": "CEO",
            "chief executive officer": "CEO",
            "founder": "Founder",
            "co-founder": "Co-Founder",
            "cto": "CTO",
            "chief technology officer": "CTO",
        }
        return role_map.get(raw_role, match.group(1).strip())

    def _is_invalid_decision_maker_name(self, decision_maker: str) -> bool:
        normalized = decision_maker.lower().strip()
        if not normalized:
            return False
        return any(term in normalized for term in self._INVALID_DECISION_MAKER_NAME_TERMS)

    def _extract_email(self, text: str) -> str:
        match = self._EMAIL_PATTERN.search(text)
        if not match:
            return ""
        return match.group(0).strip().lower()

    def _extract_domain(self, url: str) -> str:
        if not url:
            return ""

        parsed = urlparse(url)
        return parsed.netloc.lower().replace("www.", "").split(":")[0]

    def _recent_activity_summary(self, results: list[dict[str, Any]]) -> str | None:
        if not results:
            return None

        snippets = [str(item.get("title", "")).strip() for item in results if item.get("title")]
        if not snippets:
            return None

        return " | ".join(snippets[:2])

    def _pick_primary_source_url(
        self,
        preferred_urls: list[str],
        research_results: list[dict[str, Any]],
    ) -> str | None:
        for candidate in preferred_urls:
            normalized = self._normalize_url(candidate)
            if normalized:
                return normalized

        for item in research_results:
            source_url = self._extract_result_source_url(item)
            if source_url:
                return source_url

        return None

    def _extract_result_source_url(self, result: dict[str, Any]) -> str | None:
        if not isinstance(result, dict):
            return None

        for key in ("url", "link"):
            candidate = self._normalize_url(result.get(key))
            if candidate:
                return candidate

        return None

    def _normalize_url(self, value: Any) -> str | None:
        candidate = str(value or "").strip()
        if not candidate:
            return None

        parsed = urlparse(candidate)
        if parsed.scheme in {"http", "https"} and parsed.netloc:
            return candidate

        return None
