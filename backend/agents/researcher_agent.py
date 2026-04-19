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

        decision_profile = self._find_decision_maker_profile(
            company_name=company_name,
            domain=company_domain,
        )
        decision_maker_name = str(decision_profile.get("name", "")).strip()
        decision_maker_name = clean_name(decision_maker_name.replace("View ", "").strip())
        decision_maker_title = str(decision_profile.get("title", "")).strip()
        linkedin_url = str(decision_profile.get("url", "")).strip()

        size = self._infer_company_size(website_results + linkedin_results + activity_results)
        tech_stack = self._infer_tech_stack(website_results + activity_results)
        pain_point = self._infer_pain_point(
            lead=lead,
            research_results=website_results + linkedin_results + activity_results,
        )
        decision_maker = decision_maker_name or "Founder/CEO (name unknown)"
        if not is_valid_person_name(decision_maker) or self._is_invalid_decision_maker_name(
            decision_maker
        ):
            decision_maker = "Founder/CEO (name unknown)"
            decision_maker_title = ""
            linkedin_url = ""
        email_hint, email_hint_confidence, email_search_results = self._infer_email_hint(
            company_name=company_name,
            decision_maker_name=decision_maker_name,
            domain=company_domain,
            contact_hint=str(lead.get("contact_hint", "")),
        )

        enriched = dict(lead)
        enriched.update(
            {
                "company": company_name,
                "company_name": company_name,
                "size": size,
                "tech_stack": tech_stack,
                "pain_point": pain_point,
                "decision_maker": decision_maker,
                "decision_maker_title": decision_maker_title,
                "email_hint": email_hint,
                "email_hint_confidence": email_hint_confidence,
                "linkedin_url": linkedin_url,
                "website": company_site or lead_url,
                "domain": domain,
                "recent_activity": self._recent_activity_summary(activity_results),
                "research": {
                    "website_results": website_results,
                    "linkedin_results": linkedin_results,
                    "activity_results": activity_results,
                    "linkedin_profile_result": decision_profile,
                    "email_results": email_search_results,
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

    def _infer_company_size(self, results: list[dict[str, Any]]) -> str:
        combined_text = " ".join(
            f"{item.get('title', '')} {item.get('content', '')}".strip() for item in results
        )
        match = self._SIZE_PATTERN.search(combined_text)
        if match:
            size_token = match.group(1).replace("to", "-").replace(" ", "")
            return f"{size_token} employees"

        return "Unknown"

    def _infer_tech_stack(self, results: list[dict[str, Any]]) -> list[str]:
        combined_text = " ".join(
            f"{item.get('title', '')} {item.get('content', '')}".lower().strip() for item in results
        )

        stack: list[str] = []
        for needle, normalized in self._TECH_KEYWORDS.items():
            if needle in combined_text and normalized not in stack:
                stack.append(normalized)

        if stack:
            return stack[:8]
        return ["Unknown"]

    def _infer_pain_point(
        self,
        lead: dict[str, Any],
        research_results: list[dict[str, Any]],
    ) -> str:
        company_name = str(lead.get("company_name") or lead.get("company") or "this company").strip()
        if not company_name:
            company_name = "this company"

        snippet_candidates: list[str] = []
        lead_signal = str(lead.get("pain_signal") or "").strip()
        if lead_signal:
            snippet_candidates.append(lead_signal)

        for item in research_results:
            if not isinstance(item, dict):
                continue

            title = str(item.get("title") or "").strip()
            snippet = str(item.get("snippet") or "").strip()
            content = str(item.get("content") or "").strip()
            combined = " ".join(part for part in (title, snippet, content) if part).strip()
            if combined:
                snippet_candidates.append(combined)

        seen_snippets: set[str] = set()
        for raw_snippet in snippet_candidates:
            normalized_snippet = re.sub(r"\s+", " ", raw_snippet).strip()
            if not normalized_snippet or normalized_snippet in seen_snippets:
                continue
            seen_snippets.add(normalized_snippet)

            if not self._contains_pain_signal(normalized_snippet):
                continue

            candidate_pain = self._extract_clean_pain_point(normalized_snippet)
            if candidate_pain and is_valid_pain_point(candidate_pain):
                return candidate_pain

        company_description = self._build_company_description(research_results)
        industry = self._infer_industry(lead=lead, company_description=company_description)
        generated = self._generate_specific_pain_point(
            company_name=company_name,
            company_description=company_description,
            industry=industry,
        )
        if generated:
            return generated

        industry_label = industry or "B2B"
        return (
            f"As a growing {industry_label} company, {company_name} likely struggles with "
            "manual lead qualification and fragmented follow-up workflows at scale."
        )

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
            "Based on this company information:\n"
            f"Company: {company_name}\n"
            f"Description: {company_description or 'Not publicly available'}\n"
            f"Industry: {industry or 'Unknown'}\n\n"
            "Write ONE specific sentence describing a likely automation or sales pain point this "
            "company faces. Be specific to their industry. Do NOT use generic phrases like \"Likely "
            "needs AI automation\". Example: \"As a fast-growing SaaS company, COMPANY likely "
            "struggles with manual lead qualification at scale.\""
        )

        response: Any = None
        for method_name in ("generate_content", "generate", "invoke", "complete", "predict"):
            method = getattr(self.gemini_llm, method_name, None)
            if not callable(method):
                continue

            try:
                response = method(prompt)
                break
            except TypeError:
                try:
                    response = method(contents=prompt)
                    break
                except Exception:
                    continue
            except Exception:
                continue

        if response is None and callable(self.gemini_llm):
            try:
                response = self.gemini_llm(prompt)
            except Exception:
                return ""

        generated_text = self._coerce_model_text(response)
        if not generated_text:
            return ""

        single_sentence = re.split(r"(?<=[.!?])\s+", generated_text.strip())[0].strip()
        single_sentence = re.sub(r"\s+", " ", single_sentence)
        if not single_sentence:
            return ""
        if single_sentence[-1] not in ".!?":
            single_sentence = f"{single_sentence}."

        lowered = single_sentence.lower()
        if "likely needs ai automation" in lowered:
            return ""

        return single_sentence[:280]

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
            return {"name": "", "title": "", "url": ""}

        name = ""
        title = ""
        linkedin_url = ""
        source_title = ""

        for item in results:
            if not isinstance(item, dict):
                continue

            raw_title = str(item.get("title", "")).strip()
            raw_snippet = str(item.get("snippet", "")).strip()
            raw_url = str(item.get("link", "")).strip()
            candidate_name = self._extract_person_name(snippet=raw_snippet, title=raw_title)
            candidate_name = clean_name(candidate_name.replace("View ", "").strip())
            if not is_valid_person_name(candidate_name):
                continue

            name = candidate_name
            source_title = raw_title
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
                combined_text = f"{raw_title} {raw_snippet}".strip()

                extracted_title = self._extract_linkedin_title(
                    name=name,
                    company_name=company_name,
                    text=combined_text,
                )
                if extracted_title:
                    title = extracted_title

                if not linkedin_url and "linkedin.com/in/" in raw_url:
                    linkedin_url = raw_url

                if title and linkedin_url:
                    break

        return {
            "name": name,
            "title": title,
            "url": linkedin_url,
            "source_title": source_title,
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
    ) -> tuple[str, str, list[dict[str, Any]]]:
        contact_email = self._extract_email(contact_hint)
        if contact_email:
            return contact_email, "found", []

        email_query = f"{company_name} founder email contact"
        email_results = self.serper_tool.search(query=email_query, num_results=5)
        for item in email_results:
            title = str(item.get("title", "")).strip()
            snippet = str(item.get("snippet", "")).strip()
            link = str(item.get("link", "")).strip()
            discovered_email = self._extract_email(f"{title} {snippet} {link}")
            if discovered_email:
                return discovered_email, "found", email_results

        guessed_email = self._guess_email(decision_maker_name=decision_maker_name, domain=domain)
        if guessed_email:
            return guessed_email, "guessed", email_results

        return "Unknown", "guessed", email_results

    def _extract_person_name(self, snippet: str, title: str) -> str:
        for text in (snippet, title):
            for candidate in self._PERSON_NAME_PATTERN.findall(text):
                normalized = " ".join(candidate.split()).strip()
                lowered_tokens = {token.lower() for token in normalized.split()}
                if lowered_tokens & self._NAME_STOPWORDS:
                    continue
                if len(normalized.split()) < 2:
                    continue
                return normalized
        return ""

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

    def _guess_email(self, decision_maker_name: str, domain: str) -> str:
        if not domain or not decision_maker_name:
            return ""

        name_parts = [re.sub(r"[^A-Za-z]", "", token).lower() for token in decision_maker_name.split()]
        name_parts = [token for token in name_parts if token]
        if not name_parts:
            return ""

        first_name = name_parts[0]
        last_name = name_parts[-1] if len(name_parts) >= 2 else ""

        candidates = [f"{first_name}@{domain}"]
        if last_name:
            candidates.append(f"{first_name}.{last_name}@{domain}")
            candidates.append(f"{'.'.join(name_parts)}@{domain}")

        seen_candidates: set[str] = set()
        deduped_candidates: list[str] = []
        for candidate in candidates:
            if candidate in seen_candidates:
                continue
            seen_candidates.add(candidate)
            deduped_candidates.append(candidate)

        return deduped_candidates[0] if deduped_candidates else ""

    def _extract_domain(self, url: str) -> str:
        if not url:
            return ""

        parsed = urlparse(url)
        return parsed.netloc.lower().replace("www.", "").split(":")[0]

    def _recent_activity_summary(self, results: list[dict[str, Any]]) -> str:
        if not results:
            return "No notable recent public activity found"

        snippets = [str(item.get("title", "")).strip() for item in results if item.get("title")]
        if not snippets:
            return "No notable recent public activity found"

        return " | ".join(snippets[:2])
